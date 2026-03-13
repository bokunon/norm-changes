/**
 * GitHub Actions 用 cron ingest スクリプト
 * Vercel のサーバーレス関数制限を回避し、DB に直接接続して実行する。
 *
 * 使い方: npx tsx scripts/cron-ingest.ts [maxDays]
 * 例: npx tsx scripts/cron-ingest.ts 5
 *
 * 必須環境変数: DATABASE_URL, OPENAI_API_KEY
 * 任意環境変数: SLACK_WEBHOOK_URL
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { runIngestForDate } from "@/lib/ingest-laws";
import { setStatementTimeoutLong, refreshConnection } from "@/lib/db-timeout";
import {
  getLastSuccessfulIngestDate,
  setLastSuccessfulIngestDate,
} from "@/lib/ingest-state";
import { runAnalyzeForPendingSources, isAnalyzeAborted } from "@/lib/run-analyze";
import { notifySlackAlert } from "@/lib/slack";

function formatYyyyMMdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function yesterdayYyyyMMdd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatYyyyMMdd(d);
}

function parseYyyyMMdd(s: string): Date {
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(4, 6), 10) - 1;
  const d = parseInt(s.slice(6, 8), 10);
  return new Date(Date.UTC(y, m, d));
}

function nextDayYyyyMMdd(yyyyMMdd: string): string {
  const d = parseYyyyMMdd(yyyyMMdd);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatYyyyMMdd(d);
}

function dateRangeInclusive(startYyyyMMdd: string, endYyyyMMdd: string): string[] {
  const out: string[] = [];
  let cur = startYyyyMMdd;
  while (cur <= endYyyyMMdd) {
    out.push(cur);
    if (cur === endYyyyMMdd) break;
    cur = nextDayYyyyMMdd(cur);
  }
  return out;
}

async function finishCronLog(
  logId: string,
  startedAt: Date,
  result: "ok" | "error" | "aborted",
  processedDates: string[],
  errorMessage: string | null
): Promise<void> {
  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();
  await prisma.cronExecutionLog.update({
    where: { id: logId },
    data: { endedAt, result, processedDates, errorMessage, durationMs },
  });
}

async function main() {
  const endDate = yesterdayYyyyMMdd();
  const startedAt = new Date();

  const log = await prisma.cronExecutionLog.create({
    data: { startedAt, result: "ok", processedDates: [] },
  });

  try {
    const lastSuccess = await getLastSuccessfulIngestDate();
    const startDate = lastSuccess ? nextDayYyyyMMdd(lastSuccess) : endDate;
    let dates = dateRangeInclusive(startDate, endDate);

    const maxDaysArg = process.argv[2];
    if (maxDaysArg !== undefined) {
      const maxDays = Math.max(1, parseInt(maxDaysArg, 10) || 1);
      if (dates.length > maxDays) dates = dates.slice(0, maxDays);
    }

    await setStatementTimeoutLong();

    const delayAfterPrevMs = 100;
    const MAX_RETRIES = 2;

    if (dates.length === 0) {
      console.log("取り込み対象日なし（前日まで済み）。未解析の analyze を実行します。");
      const analyzeResult = await runAnalyzeForPendingSources({});
      if (isAnalyzeAborted(analyzeResult)) {
        await finishCronLog(log.id, startedAt, "aborted", [], "AI レポートを生成できません。API キー設定を確認し、次回の実行をお待ちください。");
        await notifySlackAlert({
          title: "cron中断（AI分析不可）",
          message: "AI レポートを生成できません。OPENAI_API_KEY の設定を確認してください。",
          hint: "設定後、手動で再実行してください。",
        });
        console.error("ABORTED: AI レポートを生成できません");
        process.exit(1);
      }
      const logResult = analyzeResult.ok ? "ok" : "error";
      const logError = analyzeResult.ok ? null : analyzeResult.error;
      await finishCronLog(log.id, startedAt, logResult, [], logError);
      console.log(JSON.stringify({
        ok: analyzeResult.ok,
        message: "取り込み対象日なし（前日まで済み）",
        lastSuccessfulDate: lastSuccess,
        analyze: analyzeResult.ok
          ? { created: analyzeResult.created, skippedEffectivePast: analyzeResult.skippedEffectivePast, alreadyAnalyzed: analyzeResult.alreadyAnalyzed }
          : { error: analyzeResult.error },
      }, null, 2));
      if (!analyzeResult.ok) process.exit(1);
      return;
    }

    console.log(`処理対象: ${dates[0]} 〜 ${dates[dates.length - 1]}（${dates.length}日間）`);

    const processed: { date: string; total: number; created: number; updated: number; analyzeCreated?: number }[] = [];
    let failedDate: string | null = null;
    let failedError: string | null = null;

    for (let i = 0; i < dates.length; i++) {
      const yyyyMMdd = dates[i];
      console.log(`[${i + 1}/${dates.length}] ${yyyyMMdd} を処理中...`);

      if (i === 1 && dates.length >= 2) {
        await refreshConnection();
      }

      let result: Awaited<ReturnType<typeof runIngestForDate>> | undefined;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          result = await runIngestForDate(yyyyMMdd, { delayAfterPrevMs });
          break;
        } catch (e) {
          console.warn(`  リトライ ${attempt + 1}/${MAX_RETRIES + 1}: ${e instanceof Error ? e.message : e}`);
          if (attempt < MAX_RETRIES) {
            await prisma.$disconnect();
            await setStatementTimeoutLong();
          } else {
            result = { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        }
      }
      if (!result || !result.ok) {
        failedDate = yyyyMMdd;
        failedError = result?.ok === false ? result.error : "不明なエラー";
        break;
      }
      console.log(`  ingest: ${result.total}件取得, ${result.created}件新規, ${result.updated}件更新`);
      processed.push({
        date: result.date,
        total: result.total,
        created: result.created,
        updated: result.updated,
      });

      const analyzeResult = await runAnalyzeForPendingSources({ bulkdownloadDate: yyyyMMdd });
      if (isAnalyzeAborted(analyzeResult)) {
        failedDate = yyyyMMdd;
        failedError = "AI レポートを生成できません";
        break;
      }
      if (!analyzeResult.ok) {
        failedDate = yyyyMMdd;
        failedError = analyzeResult.error;
        break;
      }
      console.log(`  analyze: ${analyzeResult.created}件生成`);
      if (processed.length > 0) {
        processed[processed.length - 1].analyzeCreated = analyzeResult.created;
      }

      await setLastSuccessfulIngestDate(yyyyMMdd);
    }

    const processedDates = processed.map((p) => p.date);

    if (failedDate) {
      await finishCronLog(log.id, startedAt, "error", processedDates, failedError);
      await notifySlackAlert({
        title: "cron失敗",
        message: `日付: ${failedDate}\nエラー: ${failedError ?? "不明"}`,
        hint: "次回 cron で続きから再試行されます。",
      });
      console.error(`FAILED: ${failedDate} - ${failedError}`);
      console.log(JSON.stringify({ ok: false, failedDate, error: failedError, processed }, null, 2));
      process.exit(1);
    }

    await finishCronLog(log.id, startedAt, "ok", processedDates, null);
    const durationSec = ((new Date().getTime() - startedAt.getTime()) / 1000).toFixed(1);
    console.log(`\n完了（${durationSec}秒）: ${processed.length}日処理`);
    console.log(JSON.stringify({ ok: true, processed }, null, 2));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finishCronLog(log.id, startedAt, "error", [], message).catch(() => {});
    await notifySlackAlert({
      title: "cron予期しないエラー",
      message: `エラー: ${message}`,
      hint: "ログを確認してください。次回 cron で再試行されます。",
    }).catch(() => {});
    console.error(`ERROR: ${message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

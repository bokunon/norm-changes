/**
 * Issue #14: 一日1回の e-Gov ingest 用エンドポイント
 * Vercel Cron または GitHub Actions から呼ばれる想定。CRON_SECRET で認証する。
 * 実行時刻: 日本時間 7:00（vercel.json の schedule: "0 22 * * *" = UTC 22:00）
 *
 * - 取り込み範囲: 前回成功した日の翌日 〜 UTC の前日（コケた場合も次回は続きから再開）
 * - maxDays: クエリパラメータ。1回の実行で処理する最大日数（未指定時は全期間）。大量の backlog 時にタイムアウトを防ぐ
 * - Issue #50: 各日ごとに ingest → analyze → setLastSuccess。lastSuccess は「ingest と analyze の両方完了」を意味
 * - ingest 成功後に analyze が失敗した場合、次回は analyze から再開（ingest はスキップ）
 * - Issue #52: 実行開始・終了を CronExecutionLog に記録
 * - Issue #63: refresh-ingest と同様の statement_timeout 延長・リトライ・接続リフレッシュ・delayAfterPrevMs を適用
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runIngestForDate } from "@/lib/ingest-laws";
import { setStatementTimeoutLong, refreshConnection } from "@/lib/db-timeout";
import {
  getLastSuccessfulIngestDate,
  setLastSuccessfulIngestDate,
} from "@/lib/ingest-state";
import { runAnalyzeForPendingSources, isAnalyzeAborted } from "@/lib/run-analyze";
import { notifySlack, notifySlackAlert } from "@/lib/slack";

function formatYyyyMMdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** UTC で「昨日」の yyyyMMdd を返す */
function yesterdayYyyyMMdd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatYyyyMMdd(d);
}

/** yyyyMMdd を UTC Date に（日のみ解釈） */
function parseYyyyMMdd(s: string): Date {
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(4, 6), 10) - 1;
  const d = parseInt(s.slice(6, 8), 10);
  return new Date(Date.UTC(y, m, d));
}

/** 指定日の翌日を yyyyMMdd で返す */
function nextDayYyyyMMdd(yyyyMMdd: string): string {
  const d = parseYyyyMMdd(yyyyMMdd);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatYyyyMMdd(d);
}

/** startYyyyMMdd 以上 endYyyyMMdd 以下の日付を yyyyMMdd 配列で返す（昇順） */
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

/** Issue #52: cron 実行ログを完了して返す */
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

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET が設定されていません" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endDate = yesterdayYyyyMMdd();
  const startedAt = new Date();

  // Issue #52: 実行開始を記録
  const log = await prisma.cronExecutionLog.create({
    data: {
      startedAt,
      result: "ok",
      processedDates: [],
    },
  });

  try {
    const lastSuccess = await getLastSuccessfulIngestDate();
    const startDate = lastSuccess ? nextDayYyyyMMdd(lastSuccess) : endDate;
    let dates = dateRangeInclusive(startDate, endDate);

    // maxDays: 1回の実行で処理する最大日数（1日≒15分のため、大量 backlog 時は1日に制限）
    const maxDaysParam = new URL(request.url).searchParams.get("maxDays");
    const maxDays =
      maxDaysParam !== null
        ? Math.min(3, Math.max(1, parseInt(maxDaysParam, 10) || 1))
        : dates.length > 1
          ? 1
          : undefined; // 2日超の backlog 時はデフォルトで1日に制限（タイムアウト防止）
    if (maxDays !== undefined && dates.length > maxDays) {
      dates = dates.slice(0, maxDays);
    }

    // Issue #63: statement_timeout を 10 分に延長
    await setStatementTimeoutLong();

    // Issue #63: e-Gov 負荷軽減のため 100ms 待機（Vercel タイムアウトを考慮して refresh-ingest より短め）
    const delayAfterPrevMs = 100;

    // Issue #63: 同一日付で最大 2 回リトライ（計 3 回実行）
    const MAX_RETRIES = 2;

    if (dates.length === 0) {
      // 取り込む日はなくても、bulkdownloadDate が null の既存データ等で未解析が残っている可能性があるので analyze を実行
      const analyzeResult = await runAnalyzeForPendingSources({});
      if (isAnalyzeAborted(analyzeResult)) {
        await finishCronLog(log.id, startedAt, "aborted", [], "AI レポートを生成できません。API キー設定を確認し、次回の実行をお待ちください。");
        await notifySlackAlert({
          title: "cron中断（AI分析不可）",
          message: "AI レポートを生成できません。OPENAI_API_KEY の設定を確認してください。",
          hint: "設定後、手動で /api/ingest/cron を呼ぶと再開できます。",
        });
        return NextResponse.json(
          { ok: false, aborted: true, error: "AI レポートを生成できません。API キー設定を確認し、次回の実行をお待ちください。" },
          { status: 503 }
        );
      }
      const logResult = analyzeResult.ok ? "ok" : "error";
      const logError = analyzeResult.ok ? null : analyzeResult.error;
      await finishCronLog(log.id, startedAt, logResult, [], logError);
      return NextResponse.json({
        ok: true,
        message: "取り込み対象日なし（前日まで済み）",
        lastSuccessfulDate: lastSuccess,
        processed: [],
        analyze:
          analyzeResult.ok
            ? {
                ok: true,
                created: analyzeResult.created,
                skippedEffectivePast: analyzeResult.skippedEffectivePast,
                alreadyAnalyzed: analyzeResult.alreadyAnalyzed,
              }
            : { ok: false, error: analyzeResult.error },
      });
    }

    // Issue #50: 日単位で ingest → analyze → setLastSuccess。analyze 失敗時は lastSuccess を進めず次回再試行
    const processed: { date: string; total: number; created: number; updated: number; analyzeCreated?: number }[] = [];
    let failedDate: string | null = null;
    let failedError: string | null = null;

    for (let i = 0; i < dates.length; i++) {
      const yyyyMMdd = dates[i];

      // Issue #63: 複数日処理時に 2 日目で接続をリフレッシュ
      if (i === 1 && dates.length >= 2) {
        await refreshConnection();
      }

      let result: Awaited<ReturnType<typeof runIngestForDate>> | undefined;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          result = await runIngestForDate(yyyyMMdd, { delayAfterPrevMs });
          break;
        } catch (e) {
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
      processed.push({
        date: result.date,
        total: result.total,
        created: result.created,
        updated: result.updated,
      });

      // その日の NormSource を解析（bulkdownloadDate でスコープ）
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
      if (processed.length > 0) {
        processed[processed.length - 1].analyzeCreated = analyzeResult.created;
      }

      // ingest と analyze の両方が成功したときのみ lastSuccess を進める
      await setLastSuccessfulIngestDate(yyyyMMdd);
    }

    const processedDates = processed.map((p) => p.date);

    if (failedDate) {
      await finishCronLog(log.id, startedAt, "error", processedDates, failedError);
      await notifySlackAlert({
        title: "cron失敗",
        message: `日付: ${failedDate ?? "不明"}\nエラー: ${failedError ?? "不明"}`,
        hint: "次回 cron で続きから再試行されます（手動実行: /api/ingest/cron）",
      });
      return NextResponse.json({
        ok: false,
        failedDate,
        error: failedError,
        hint: "次回 cron で前回の続きから再試行されます（ingest 済みの場合は analyze から）。",
        processed,
        _debug: { lastSuccessfulDate: lastSuccess, startDate, endDate, datesCount: dates.length },
      });
    }

    const lastProcessed = processed[processed.length - 1];
    await finishCronLog(log.id, startedAt, "ok", processedDates, null);
    return NextResponse.json({
      ok: true,
      processed,
      lastSuccessfulDate: lastProcessed?.date ?? endDate,
      analyze:
        lastProcessed?.analyzeCreated !== undefined
          ? { ok: true, created: lastProcessed.analyzeCreated }
          : { ok: true, created: 0 },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await finishCronLog(log.id, startedAt, "error", [], message).catch(() => {});
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

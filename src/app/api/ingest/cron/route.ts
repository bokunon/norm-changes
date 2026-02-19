/**
 * Issue #14: 一日1回の e-Gov ingest 用エンドポイント
 * Vercel Cron からのみ呼ばれる想定。CRON_SECRET で認証する。
 * 実行時刻: 日本時間 7:00（vercel.json の schedule: "0 22 * * *" = UTC 22:00）
 *
 * - 取り込み範囲: 前回成功した日の翌日 〜 UTC の前日（コケた場合も次回は続きから再開）
 * - 初回や記録がない場合は「前日」のみ取り込む
 * - 手動で日付指定して試す場合は GET /api/ingest/laws?date=yyyyMMdd を使用すること
 * - ingest 成功後、NormChange がまだない NormSource に対して自動で analyze を実行し一覧に表示されるようにする
 */
import { NextResponse } from "next/server";
import { runIngestForDate } from "@/lib/ingest-laws";
import {
  getLastSuccessfulIngestDate,
  setLastSuccessfulIngestDate,
} from "@/lib/ingest-state";
import { runAnalyzeForPendingSources } from "@/lib/run-analyze";

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

  try {
    const lastSuccess = await getLastSuccessfulIngestDate();
    const startDate = lastSuccess ? nextDayYyyyMMdd(lastSuccess) : endDate;
    const dates = dateRangeInclusive(startDate, endDate);

    if (dates.length === 0) {
      // 取り込む日はなくても、未解析の NormSource が残っている可能性があるので analyze は実行する
      const analyzeResult = await runAnalyzeForPendingSources({});
      return NextResponse.json({
        ok: true,
        message: "取り込み対象日なし（前日まで済み）",
        lastSuccessfulDate: lastSuccess,
        processed: [],
        analyze:
          analyzeResult.ok
            ? { ok: true, created: analyzeResult.created }
            : { ok: false, error: analyzeResult.error },
      });
    }

    const processed: { date: string; total: number; created: number; updated: number }[] = [];
    let failedDate: string | null = null;
    let failedError: string | null = null;

    for (const yyyyMMdd of dates) {
      const result = await runIngestForDate(yyyyMMdd);
      if (!result.ok) {
        failedDate = yyyyMMdd;
        failedError = result.error;
        break;
      }
      await setLastSuccessfulIngestDate(yyyyMMdd);
      processed.push({
        date: result.date,
        total: result.total,
        created: result.created,
        updated: result.updated,
      });
    }

    if (failedDate) {
      return NextResponse.json({
        ok: false,
        failedDate,
        error: failedError,
        hint: "次回 cron で前回の続きから再試行されます。",
        processed,
      });
    }

    // ingest で取り込んだ NormSource から NormChange を生成（一覧に表示されるようにする）
    const analyzeResult = await runAnalyzeForPendingSources({});

    return NextResponse.json({
      ok: true,
      processed,
      lastSuccessfulDate: endDate,
      analyze:
        analyzeResult.ok
          ? { ok: true, created: analyzeResult.created }
          : { ok: false, error: analyzeResult.error },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

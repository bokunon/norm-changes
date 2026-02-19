/**
 * Issue #14: 一日1回の e-Gov ingest 用エンドポイント
 * Vercel Cron からのみ呼ばれる想定。CRON_SECRET で認証する。
 *
 * - 取り込む日付: UTC の前日（日本時間では実行時刻により前日〜当日のいずれか）
 * - 手動で日付指定して試す場合は GET /api/ingest/laws?date=yyyyMMdd を使用すること
 */
import { NextResponse } from "next/server";
import { runIngestForDate } from "@/lib/ingest-laws";

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

  const yyyyMMdd = yesterdayYyyyMMdd();

  try {
    const result = await runIngestForDate(yyyyMMdd);

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        date: yyyyMMdd,
        error: result.error,
        hint: "e-Gov bulkdownload の障害や指定日にデータがない可能性があります。",
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, date: yyyyMMdd, error: message },
      { status: 500 }
    );
  }
}

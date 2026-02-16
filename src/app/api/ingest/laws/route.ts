/**
 * e-Gov bulkdownload で日付指定の更新法令一覧を取得し、NormSource に保存する
 * GET /api/ingest/laws?date=yyyyMMdd
 * Issue #22: bulkdownload（ZIP解凍・CSVパース）に切り替え
 * Issue #23: 公示日は CSV「改正法令公布日」で保存（空なら「公布日」）
 * Issue #24: ZIP 内 XML 本文を NormSource.rawText に保存
 * Issue #25: 改正前全文を law_revisions / law_data で取得し NormSource.rawTextPrev に保存
 */
import { NextResponse } from "next/server";
import { runIngestForDate } from "@/lib/ingest-laws";

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const yyyyMMdd = date ?? formatDate(new Date());

    const result = await runIngestForDate(yyyyMMdd);

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: result.error,
        hint: "e-Gov bulkdownload の障害や日付指定（yyyyMMdd）の誤り、ZIP/CSV形式変更の可能性があります。",
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message, hint: "ingest 処理中の例外です。" },
      { status: 500 }
    );
  }
}

/**
 * NormSource から NormChange を生成する（MVP: 1ソース1変更点）
 * POST /api/analyze?normSourceId=xxx （省略時は NormChange がまだない NormSource を対象）
 * Issue #12: OPENAI_API_KEY 設定時は AI でレポート生成。
 * Issue #40: AI レポートが作れない場合は NormChange を登録せず 503 で返す。
 * Issue #30: 通知用フィルタが 1 つ以上あるとき、新規 NormChange がそのいずれかに一致した場合のみ Slack 通知
 */
import { NextResponse } from "next/server";
import { runAnalyzeForPendingSources, isAnalyzeAborted } from "@/lib/run-analyze";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const normSourceId = searchParams.get("normSourceId");
  const replace = searchParams.get("replace") === "1";

  const result = await runAnalyzeForPendingSources({
    normSourceId: normSourceId ?? undefined,
    replace,
  });

  if (!result.ok) {
    if (isAnalyzeAborted(result)) {
      return NextResponse.json(
        { ok: false, aborted: true, error: "AI レポートを生成できません。API キー設定を確認し、次回の実行をお待ちください。" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error.includes("normSourceId") ? 400 : 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    ids: result.ids,
  });
}

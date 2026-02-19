/**
 * Slack 関連の設定状態を返す（Issue #30）
 * GET /api/slack-config
 * Webhook URL は返さず、設定済みかどうかのみ返す
 */
import { NextResponse } from "next/server";

export async function GET() {
  const webhookConfigured =
    typeof process.env.SLACK_WEBHOOK_URL === "string" &&
    process.env.SLACK_WEBHOOK_URL.trim() !== "";

  return NextResponse.json({
    ok: true,
    webhookConfigured,
    // 将来的にチャンネル一覧など Slack API から取得した情報を載せられる
  });
}

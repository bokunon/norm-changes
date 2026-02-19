/**
 * Issue #32: 生成API（OpenAI）の利用状況を返す。
 * 取得可能な範囲で、設定有無・利用量のヒントを返す。
 */
import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  const configured = !!(key && key.trim().length > 0);
  return NextResponse.json({
    configured,
    message: configured
      ? "OpenAI API キー設定済み。利用量は OpenAI ダッシュボードで確認できます。"
      : "OpenAI API キー未設定。.env の OPENAI_API_KEY を設定すると AI レポート生成が利用できます。",
    usageUrl: "https://platform.openai.com/usage",
  });
}

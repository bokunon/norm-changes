/**
 * 診断用: このサーバープロセスで OPENAI_API_KEY が読まれているか確認する
 * 値は返さず、設定されているかどうかだけ返す（LAST USED が Never の原因切り分け用）
 */
import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  const set = !!(key && key.trim().length > 0);
  return NextResponse.json({
    openaiKeySet: set,
    hint: set
      ? "このプロセスでは OPENAI_API_KEY が設定されています。再解析で OpenAI が呼ばれるはずです。"
      : "このプロセスでは OPENAI_API_KEY が未設定です。.env を保存したうえで、開発サーバーを再起動してください。",
  });
}

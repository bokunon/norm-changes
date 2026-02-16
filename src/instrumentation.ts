/**
 * Next サーバー起動時に一度だけ実行される。
 * .env を読み込む（Issue #26: 接続文字列をそのまま設定するため expand 不要）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dotenv = await import("dotenv");
    dotenv.config();
  }
}

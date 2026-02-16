/**
 * Next サーバー起動時に一度だけ実行される。
 * .env の ${DB_PASSWORD} 等を展開して process.env に上書きする。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dotenv = await import("dotenv");
    const { expand } = await import("dotenv-expand");
    expand(dotenv.config());
  }
}

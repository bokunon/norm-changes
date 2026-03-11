import { NextRequest, NextResponse } from "next/server";

/**
 * 管理系APIエンドポイントをADMIN_API_KEYで保護する。
 * 一覧取得（GET /api/norm-changes）は公開のまま。
 * ADMIN_API_KEY未設定時は警告をログに出力して通過させる（開発用）。
 *
 * また /about, /settings は一般公開しない（404を返す）。
 */

const BLOCKED_PATHS = ["/about", "/settings"];

const PROTECTED_PATHS = [
  "/api/analyze",
  "/api/notification-filters",
  "/api/slack-config",
  "/api/ingest/laws",
  "/api/ingest/state",
  "/api/debug-openai-env",
  "/api/openai-usage",
];

// GET /api/norm-changes と GET /api/ingest/cron-logs は公開
function isProtected(pathname: string, method: string): boolean {
  if (pathname === "/api/norm-changes" && method === "GET") return false;
  if (pathname.startsWith("/api/norm-changes/") && method === "GET") return false;
  if (pathname === "/api/ingest/cron-logs" && method === "GET") return false;
  if (pathname === "/api/db-health" && method === "GET") return false;
  // cron は CRON_SECRET で別途認証済み
  if (pathname === "/api/ingest/cron") return false;
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // /about, /settings は 404
  if (BLOCKED_PATHS.includes(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 管理系API認証
  if (isProtected(pathname, method)) {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      console.warn("[proxy] ADMIN_API_KEY未設定のため認証をスキップします。本番環境では必ず設定してください。");
      return NextResponse.next();
    }

    const authHeader = request.headers.get("authorization");
    const providedKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (providedKey !== adminKey) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", message: "認証が必要です。Authorization: Bearer <ADMIN_API_KEY> ヘッダーを付けてください。" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/about", "/settings", "/api/:path*"],
};

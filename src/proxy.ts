/**
 * 一般公開時: /about, /settings のみ閉じる。
 * /norm-changes 一覧および /norm-changes/[id] 詳細は公開。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 閉じる（404 を返す）パス */
const BLOCKED_PATHS = ["/about", "/settings"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (BLOCKED_PATHS.includes(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/about", "/settings"],
};

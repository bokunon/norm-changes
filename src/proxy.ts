/**
 * 一般公開時: 一覧画面（/norm-changes）のみ公開し、サブページを閉じる。
 * 管理用ログインは後で検討。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 閉じる（404 を返す）パス */
const BLOCKED_PATHS = ["/about", "/settings"];

/** /norm-changes/[id] 形式（詳細ページ）もブロック */
const NORM_CHANGES_DETAIL_REGEX = /^\/norm-changes\/[^/]+$/;

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (BLOCKED_PATHS.includes(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (NORM_CHANGES_DETAIL_REGEX.test(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/about", "/settings", "/norm-changes/:path+"],
};

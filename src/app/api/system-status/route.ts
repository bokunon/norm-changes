/**
 * Issue #113, #120: システム稼働状況 API
 * - 最後に cron が正常完了した日時（CronExecutionLog で判定）
 * - 直近10日の新着件数（NormChange.createdAt）
 * 認証不要（集計値のみを返す公開エンドポイント）
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 10);
    since.setHours(0, 0, 0, 0);

    const [lastCron, recentCount] = await Promise.all([
      prisma.cronExecutionLog.findFirst({
        where: { result: "ok" },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      }),
      prisma.normChange.count({
        where: { normSource: { publishedAt: { gte: since } } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      lastCronAt: lastCron?.startedAt ?? null,
      recentCount,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

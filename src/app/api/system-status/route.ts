/**
 * Issue #113: システム稼働状況 API
 * - 最後に NormChange が生成された日時
 * - 直近10日の新着件数
 * 認証不要（集計値のみを返す公開エンドポイント）
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 10);
    since.setHours(0, 0, 0, 0);

    const [latest, recentCount] = await Promise.all([
      prisma.normChange.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.normChange.count({
        where: { createdAt: { gte: since } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      lastDetectedAt: latest?.createdAt ?? null,
      recentCount,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

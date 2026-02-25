/**
 * Issue #52: cron 実行ログを返す API
 * CRON_SECRET で認証。直近 N 件の実行結果を確認する用。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
      MAX_LIMIT
    );

    const logs = await prisma.cronExecutionLog.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        startedAt: l.startedAt.toISOString(),
        endedAt: l.endedAt?.toISOString() ?? null,
        result: l.result,
        processedDates: l.processedDates as string[],
        processedCount: (l.processedDates as string[]).length,
        errorMessage: l.errorMessage,
        durationMs: l.durationMs,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

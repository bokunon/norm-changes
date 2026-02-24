/**
 * IngestState の状態を返すデバッグ用 API
 * CRON_SECRET で認証。本番の IngestState 確認用。
 */
import { NextResponse } from "next/server";
import { getLastSuccessfulIngestDate } from "@/lib/ingest-state";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lastSuccess = await getLastSuccessfulIngestDate();
    const [minPub, maxPub, count] = await Promise.all([
      prisma.normSource.aggregate({ _min: { publishedAt: true } }),
      prisma.normSource.aggregate({ _max: { publishedAt: true } }),
      prisma.normSource.count(),
    ]);
    const maxPublishedStr = maxPub._max.publishedAt
      ? maxPub._max.publishedAt.toISOString().slice(0, 10)
      : null;

    return NextResponse.json({
      lastSuccessfulDate: lastSuccess,
      normSourceCount: count,
      publishedAtMin: minPub._min.publishedAt?.toISOString().slice(0, 10) ?? null,
      publishedAtMax: maxPublishedStr,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

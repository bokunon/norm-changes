import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DB 接続ヘルスチェック用エンドポイント
// ブラウザから /api/db-health を叩くと、DB 接続可否を JSON で返します。
export async function GET() {
  try {
    // シンプルなクエリで接続確認（SELECT 1 と同等）
    const now = await prisma.$queryRawUnsafe<[{ now: Date }]>('SELECT NOW() as "now"');

    return NextResponse.json(
      {
        ok: true,
        now: now[0]?.now ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("DB health check failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}


/**
 * NormSource から NormChange を生成する（MVP: 1ソース1変更点）
 * POST /api/analyze?normSourceId=xxx （省略時は NormChange がまだない NormSource を対象）
 * SLACK_WEBHOOK_URL 設定時は新規 NormChange ごとに Slack 通知
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  detectPenaltyRisk,
  detectObligationLevel,
  buildSummary,
} from "@/lib/analyze";
import { notifySlack } from "@/lib/slack";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const normSourceId = searchParams.get("normSourceId");

  const sources = normSourceId
    ? await prisma.normSource.findMany({ where: { id: normSourceId } })
    : await prisma.normSource.findMany({
        where: {
          changes: { none: {} },
        },
      });

  const created: string[] = [];

  for (const src of sources) {
    const text = src.rawText ?? src.title;
    const penaltyRisk = detectPenaltyRisk(text);
    const obligationLevel = detectObligationLevel(text);
    const summary = buildSummary(src.title, src.rawText);

    const change = await prisma.normChange.create({
      data: {
        normSourceId: src.id,
        summary,
        obligationLevel,
        penaltyRisk,
        penaltyDetail: penaltyRisk !== "NONE" ? "罰則・義務規定の可能性（要確認）" : null,
        effectiveFrom: src.effectiveAt ?? null,
        deadline: null,
      },
    });
    created.push(change.id);

    await notifySlack({
      title: src.title,
      summary,
      type: src.type,
      publishedAt: src.publishedAt.toISOString().slice(0, 10),
      effectiveAt: src.effectiveAt?.toISOString().slice(0, 10) ?? null,
      url: src.url ?? null,
      penaltyRisk,
    });
  }

  return NextResponse.json({
    ok: true,
    created: created.length,
    ids: created,
  });
}

/**
 * NormChange 詳細取得
 * GET /api/norm-changes/[id]
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const change = await prisma.normChange.findUnique({
    where: { id },
    include: {
      normSource: true,
      tags: { include: { tag: true } },
    },
  });

  if (!change) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    item: {
      id: change.id,
      summary: change.summary,
      obligationLevel: change.obligationLevel,
      penaltyRisk: change.penaltyRisk,
      riskSurvival: change.riskSurvival,
      riskFinancial: change.riskFinancial,
      riskCredit: change.riskCredit,
      penaltyDetail: change.penaltyDetail,
      effectiveFrom: change.effectiveFrom?.toISOString() ?? null,
      deadline: change.deadline?.toISOString() ?? null,
      createdAt: change.createdAt.toISOString(),
      updatedAt: change.updatedAt.toISOString(),
      normSource: change.normSource
        ? {
            id: change.normSource.id,
            type: change.normSource.type,
            title: change.normSource.title,
            number: change.normSource.number,
            publisher: change.normSource.publisher,
            publishedAt: change.normSource.publishedAt.toISOString(),
            effectiveAt: change.normSource.effectiveAt?.toISOString() ?? null,
            url: change.normSource.url,
            rawText: change.normSource.rawText,
            rawTextPrev: change.normSource.rawTextPrev,
          }
        : null,
      tags: change.tags.map((rel: { tag: { id: string; type: string; key: string; labelJa: string; description: string | null } }) => rel.tag),
    },
  });
}

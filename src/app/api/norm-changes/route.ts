/**
 * NormChange 一覧取得（フィルタ: 公示日・施行日・種別・タグ・リスク3軸）
 * GET /api/norm-changes?from=yyyyMMdd&to=yyyyMMdd&type=LAW&tagId=xxx&risk=survival,financial,credit
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const RISK_VALUES = ["survival", "financial", "credit", "other"] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const type = searchParams.get("type");
  const tagId = searchParams.get("tagId");
  const riskParam = searchParams.get("risk");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  const normSourceWhere: { publishedAt?: { gte?: Date; lte?: Date }; type?: string } = {};
  if (from) {
    const d = parseYyyyMMdd(from);
    if (d) normSourceWhere.publishedAt = { ...normSourceWhere.publishedAt, gte: d };
  }
  if (to) {
    const d = parseYyyyMMdd(to);
    if (d) normSourceWhere.publishedAt = { ...normSourceWhere.publishedAt, lte: d };
  }
  if (type) normSourceWhere.type = type;

  const riskFilters = riskParam
    ? riskParam.split(",").filter((r) => RISK_VALUES.includes(r as (typeof RISK_VALUES)[number]))
    : [];

  const where: {
    normSource?: { publishedAt?: { gte?: Date; lte?: Date }; type?: string };
    tags?: { some: { tagId: string } };
    OR?: { riskSurvival?: boolean; riskFinancial?: boolean; riskCredit?: boolean; riskOther?: boolean }[];
  } = {};
  if (Object.keys(normSourceWhere).length > 0) {
    where.normSource = normSourceWhere;
  }
  if (tagId) {
    where.tags = { some: { tagId } };
  }
  if (riskFilters.length > 0) {
    where.OR = riskFilters.map((r) => {
      if (r === "survival") return { riskSurvival: true };
      if (r === "financial") return { riskFinancial: true };
      if (r === "credit") return { riskCredit: true };
      return { riskOther: true };
    });
  }

  const items = await prisma.normChange.findMany({
    where,
    include: {
      normSource: true,
      tags: { include: { tag: true } },
    },
    orderBy: [{ normSource: { publishedAt: "desc" } }, { createdAt: "desc" }],
    take: limit,
  });

  type Item = (typeof items)[number];
  return NextResponse.json({
    ok: true,
    items: items.map((i: Item) => ({
      id: i.id,
      summary: i.summary,
      obligationLevel: i.obligationLevel,
      penaltyRisk: i.penaltyRisk,
      riskSurvival: i.riskSurvival,
      riskFinancial: i.riskFinancial,
      riskCredit: i.riskCredit,
      riskOther: i.riskOther,
      penaltyDetail: i.penaltyDetail,
      effectiveFrom: i.effectiveFrom?.toISOString() ?? null,
      deadline: i.deadline?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      normSource: i.normSource
        ? {
            id: i.normSource.id,
            type: i.normSource.type,
            title: i.normSource.title,
            number: i.normSource.number,
            publishedAt: i.normSource.publishedAt.toISOString(),
            effectiveAt: i.normSource.effectiveAt?.toISOString() ?? null,
            url: i.normSource.url,
          }
        : null,
      tags: i.tags.map((rel: { tag: { id: string; type: string; key: string; labelJa: string; description: string | null } }) => rel.tag),
    })),
  });
}

function parseYyyyMMdd(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  return new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`
  );
}

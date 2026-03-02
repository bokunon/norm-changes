/**
 * NormChange 一覧取得（フィルタ: 公示日・施行日・種別・タグ・リスク・施行状態）
 * Issue #31: デフォルト limit=20、cursor で次ページ取得。
 * Issue #53: enforcement パラメータ（not_yet / enforced）で施行済・未施行を絞り込み。
 * GET /api/norm-changes?from=...&to=...&enforcement=not_yet&limit=20&cursor=lastId
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const RISK_VALUES = ["survival", "financial", "credit", "other"] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** 今日 0:00 UTC */
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const type = searchParams.get("type");
  const tagId = searchParams.get("tagId");
  const riskParam = searchParams.get("risk");
  const enforcement = searchParams.get("enforcement"); // not_yet | enforced
  const limit = Math.min(
    Number(searchParams.get("limit")) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const cursor = searchParams.get("cursor") ?? undefined;

  const todayStart = startOfTodayUtc();
  const normSourceWhere: {
    publishedAt?: { gte?: Date; lte?: Date };
    type?: string;
    OR?: Array<{ effectiveAt: null } | { effectiveAt: { gt: Date } }>;
    effectiveAt?: { not: null; lte: Date };
  } = {};
  if (from) {
    const d = parseYyyyMMdd(from);
    if (d) normSourceWhere.publishedAt = { ...normSourceWhere.publishedAt, gte: d };
  }
  if (to) {
    const d = parseYyyyMMdd(to);
    if (d) normSourceWhere.publishedAt = { ...normSourceWhere.publishedAt, lte: d };
  }
  if (type) normSourceWhere.type = type;
  // Issue #53: 施行状態で絞り込み（effectiveAt で判定）
  if (enforcement === "not_yet") {
    normSourceWhere.OR = [{ effectiveAt: null }, { effectiveAt: { gt: todayStart } }];
  } else if (enforcement === "enforced") {
    normSourceWhere.effectiveAt = { not: null, lte: todayStart };
  }

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

  // Issue #47: normSource は rawText/rawTextPrev を除外して取得（egress 削減・一覧では不要）
  const items = await prisma.normChange.findMany({
    where,
    include: {
      normSource: {
        select: {
          id: true,
          type: true,
          title: true,
          number: true,
          publishedAt: true,
          effectiveAt: true,
          url: true,
        },
      },
      tags: { include: { tag: true } },
    },
    orderBy: [
      { normSource: { publishedAt: "desc" } },
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: limit + 1, // 次ページの有無判定用に1件多めに取得
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const list = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? list[list.length - 1]?.id : null;

  type Item = (typeof list)[number];
  return NextResponse.json({
    ok: true,
    items: list.map((i: Item) => ({
      id: i.id,
      summary: i.summary,
      riskSurvival: i.riskSurvival,
      riskFinancial: i.riskFinancial,
      riskCredit: i.riskCredit,
      riskOther: i.riskOther,
      penaltyDetail: i.penaltyDetail,
      effectiveFrom: i.effectiveFrom?.toISOString() ?? null,
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
    nextCursor: nextCursor ?? undefined,
  });
}

function parseYyyyMMdd(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  return new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`
  );
}

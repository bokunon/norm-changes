/**
 * NormSource から NormChange を生成する（MVP: 1ソース1変更点）
 * POST /api/analyze?normSourceId=xxx （省略時は NormChange がまだない NormSource を対象）
 * Issue #12: OPENAI_API_KEY 設定時は AI でレポート生成。未設定時はキーワードのみ。
 * Issue #30: 通知用フィルタが 1 つ以上あるとき、新規 NormChange がそのいずれかに一致した場合のみ Slack 通知
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  detectPenaltyRisk,
  detectObligationLevel,
  detectRiskTypes,
  buildSummary,
} from "@/lib/analyze";
import { notifySlack } from "@/lib/slack";
import { generateReport } from "@/lib/report-ai";
import { matchesNotificationFilter } from "@/lib/notification-filter-match";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const normSourceId = searchParams.get("normSourceId");
  const replace = searchParams.get("replace") === "1"; // 既存 NormChange を削除して再解析（洗い替え・テスト用）

  let sources = normSourceId
    ? await prisma.normSource.findMany({ where: { id: normSourceId } })
    : await prisma.normSource.findMany({
        where: {
          changes: { none: {} },
        },
      });

  if (replace && normSourceId && sources.length > 0) {
    await prisma.normChange.deleteMany({ where: { normSourceId } });
  } else if (replace && !normSourceId) {
    return NextResponse.json(
      { ok: false, error: "replace=1 の場合は normSourceId を指定してください" },
      { status: 400 }
    );
  }

  const created: string[] = [];

  try {
  for (const src of sources) {
    const text = src.rawText ?? src.title;
    let summary = buildSummary(src.title, src.rawText);
    let obligationLevel = detectObligationLevel(text);
    let penaltyRisk = detectPenaltyRisk(text);
    const riskTypes = detectRiskTypes(text);

    let reportSummary: string | null = null;
    let reportActionItems: string[] | null = null;
    let reportDetailedRecommendations: { action: string; basis: string }[] | null = null;

    const report = await generateReport({
      title: src.title,
      type: src.type,
      publishedAt: src.publishedAt.toISOString().slice(0, 10),
      effectiveAt: src.effectiveAt?.toISOString().slice(0, 10) ?? null,
      rawText: src.rawText,
      rawTextPrev: src.rawTextPrev,
    });

    if (report) {
      reportSummary = report.summary;
      reportActionItems = report.actionItems.length > 0 ? report.actionItems : null;
      reportDetailedRecommendations =
        report.detailedRecommendations.length > 0 ? report.detailedRecommendations : null;
      if (report.summary) summary = report.summary;
      if (report.obligationLevel) obligationLevel = report.obligationLevel;
      if (report.riskLevel) penaltyRisk = report.riskLevel;
    }

    const change = await prisma.normChange.create({
      data: {
        normSourceId: src.id,
        summary,
        obligationLevel,
        penaltyRisk,
        penaltyDetail: penaltyRisk !== "NONE" ? "罰則・義務規定の可能性（要確認）" : null,
        riskSurvival: riskTypes.survival,
        riskFinancial: riskTypes.financial,
        riskCredit: riskTypes.credit,
        effectiveFrom: src.effectiveAt ?? null,
        deadline: null,
        reportSummary,
        reportActionItems: reportActionItems ?? undefined,
        reportDetailedRecommendations: reportDetailedRecommendations ?? undefined,
      },
    });
    created.push(change.id);

    // Issue #30: 通知用フィルタに一致したときだけ Slack に送信
    const notificationFilters = await prisma.notificationFilter.findMany();
    if (notificationFilters.length > 0) {
      const changeWithTags = await prisma.normChange.findUnique({
        where: { id: change.id },
        include: { tags: true },
      });
      const hasTagId = (tagId: string) =>
        (changeWithTags?.tags.some((t) => t.tagId === tagId) ?? false);
      const shouldNotify = notificationFilters.some((f) =>
        matchesNotificationFilter(
          change,
          src,
          f,
          f.tagId ? hasTagId(f.tagId) : true
        )
      );
      if (shouldNotify) {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.SITE_URL ?? "http://localhost:3000";
        await notifySlack({
          title: src.title,
          summary,
          penaltyRisk,
          detailPageUrl: `${baseUrl}/norm-changes/${change.id}`,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    created: created.length,
    ids: created,
  });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

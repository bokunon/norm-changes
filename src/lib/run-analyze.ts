/**
 * NormSource から NormChange を生成する処理（API と cron から共通利用）
 * POST /api/analyze および ingest cron の「取り込み後に解析」で使用
 */
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

export interface RunAnalyzeOptions {
  /** 指定時はその NormSource のみ解析。省略時は NormChange がまだない全件 */
  normSourceId?: string | null;
  /** true のとき既存 NormChange を削除して再解析（normSourceId 指定時のみ有効） */
  replace?: boolean;
}

export interface RunAnalyzeResult {
  ok: true;
  created: number;
  ids: string[];
}

export interface RunAnalyzeError {
  ok: false;
  error: string;
}

export type RunAnalyzeOutput = RunAnalyzeResult | RunAnalyzeError;

/**
 * 未解析の NormSource に対して NormChange を生成する。
 * cron の ingest 成功後や POST /api/analyze から呼ぶ。
 */
/** 今日の 0:00 UTC（施行日が「今日以降」の判定用） */
function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * 未解析の NormSource に対して NormChange を生成する。
 * cron の ingest 成功後や POST /api/analyze から呼ぶ。
 * normSourceId 省略時は「施行日が今日以降」のものだけ対象（施行日未定も含む）。API コスト削減のため。
 */
export async function runAnalyzeForPendingSources(
  options: RunAnalyzeOptions = {}
): Promise<RunAnalyzeOutput> {
  const { normSourceId = null, replace = false } = options;

  const todayStart = startOfTodayUtc();

  let sources = normSourceId
    ? await prisma.normSource.findMany({ where: { id: normSourceId } })
    : await prisma.normSource.findMany({
        where: {
          changes: { none: {} },
          // 施行日が今日以降のものだけ（施行日未定＝null も対象）
          OR: [
            { effectiveAt: null },
            { effectiveAt: { gte: todayStart } },
          ],
        },
      });

  // replace=1 のとき、削除前にタグID一覧を控えておく（再解析後にタグを引き継ぎ、通知フィルタが一致するようにする）
  let tagIdsToRestore: string[] = [];
  if (replace && normSourceId && sources.length > 0) {
    const existingTags = await prisma.normChangeTag.findMany({
      where: { normChange: { normSourceId } },
      select: { tagId: true },
    });
    tagIdsToRestore = [...new Set(existingTags.map((t) => t.tagId))];
    await prisma.normChange.deleteMany({ where: { normSourceId } });
  } else if (replace && !normSourceId) {
    return {
      ok: false,
      error: "replace=1 の場合は normSourceId を指定してください",
    };
  }

  const created: string[] = [];

  try {
    for (const src of sources) {
      const text = src.rawText ?? src.title;
      let summary = buildSummary(src.title, src.rawText);
      let obligationLevel = detectObligationLevel(text);
      let penaltyRisk = detectPenaltyRisk(text);
      let riskTypes = detectRiskTypes(text);

      let reportSummary: string | null = null;
      let reportActionItems: { text: string; source?: "amendment" | "existing" }[] | null = null;
      let reportDetailedRecommendations: {
        action: string;
        basis: string;
        source?: "amendment" | "existing";
      }[] | null = null;

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
        reportActionItems =
          report.actionItems.length > 0
            ? report.actionItems.map((a) => ({ text: a.text, source: a.source }))
            : null;
        reportDetailedRecommendations =
          report.detailedRecommendations.length > 0
            ? report.detailedRecommendations.map((r) => ({
                action: r.action,
                basis: r.basis,
                source: r.source,
              }))
            : null;
        if (report.summary) summary = report.summary;
        if (report.obligationLevel) obligationLevel = report.obligationLevel;
        if (report.riskLevel) penaltyRisk = report.riskLevel;
        if (report.primaryRiskType) {
          const p = report.primaryRiskType;
          riskTypes = {
            survival: p === "survival",
            financial: p === "financial",
            credit: p === "credit",
            other: p === "other",
          };
        }
      }

      const change = await prisma.normChange.create({
        data: {
          normSourceId: src.id,
          summary,
          obligationLevel,
          penaltyRisk,
          penaltyDetail:
            report?.penaltyDetailText ??
            (penaltyRisk !== "NONE" ? "罰則・義務規定の可能性（要確認）" : null),
          riskSurvival: riskTypes.survival,
          riskFinancial: riskTypes.financial,
          riskCredit: riskTypes.credit,
          riskOther: riskTypes.other,
          effectiveFrom: src.effectiveAt ?? null,
          deadline: null,
          reportSummary,
          reportActionItems: reportActionItems ?? undefined,
          reportDetailedRecommendations: reportDetailedRecommendations ?? undefined,
        },
      });
      created.push(change.id);

      if (tagIdsToRestore.length > 0 && normSourceId && src.id === normSourceId) {
        await prisma.normChangeTag.createMany({
          data: tagIdsToRestore.map((tagId) => ({
            normChangeId: change.id,
            tagId,
          })),
          skipDuplicates: true,
        });
      }

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
          // Slack のリンク: SITE_URL 優先（本番URLを明示可能）。未設定なら VERCEL_URL（Vercel のみ）、最後に localhost
          const baseUrl =
            process.env.SITE_URL?.trim() ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
            "http://localhost:3000";
          await notifySlack({
            title: src.title,
            riskDetailText: change.penaltyDetail ?? null,
            detailPageUrl: `${baseUrl}/norm-changes/${change.id}`,
          });
        }
      }
    }

    return { ok: true, created: created.length, ids: created };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * NormSource から NormChange を生成する処理（API と cron から共通利用）
 * POST /api/analyze および ingest cron の「取り込み後に解析」で使用
 */
import { prisma } from "@/lib/prisma";
import { buildSummary } from "@/lib/analyze";
import { notifySlack } from "@/lib/slack";
import { generateReport } from "@/lib/report-ai";
import { detectRiskByKeywords } from "@/lib/risk-keyword-fallback";
import { matchesNotificationFilter } from "@/lib/notification-filter-match";
import { stripObligationAndLevelFromSummary } from "@/lib/risk-display";

export interface RunAnalyzeOptions {
  /** 指定時はその NormSource のみ解析。省略時は NormChange がまだない全件 */
  normSourceId?: string | null;
  /** true のとき既存 NormChange を削除して再解析（normSourceId 指定時のみ有効） */
  replace?: boolean;
  /** Issue #50: 指定時はこの bulkdownload 日付（yyyyMMdd）の NormSource のみ対象。cron の日単位連動用 */
  bulkdownloadDate?: string | null;
}

export interface RunAnalyzeResult {
  ok: true;
  created: number;
  ids: string[];
  /** Issue #44: 施行日が今日より前のためスキップした件数（normSourceId 指定時は undefined） */
  skippedEffectivePast?: number;
  /** Issue #44: 既に NormChange がある件数（normSourceId 指定時は undefined） */
  alreadyAnalyzed?: number;
}

export interface RunAnalyzeError {
  ok: false;
  error: string;
}

/** Issue #40: AI レポートが作れない場合は登録せず処理を打ち切る */
export interface RunAnalyzeAborted {
  ok: false;
  aborted: true;
  reason: "AI_REPORT_UNAVAILABLE";
}

export type RunAnalyzeOutput = RunAnalyzeResult | RunAnalyzeError | RunAnalyzeAborted;

export function isAnalyzeAborted(o: RunAnalyzeOutput): o is RunAnalyzeAborted {
  return o.ok === false && "aborted" in o && o.aborted === true;
}

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
  const { normSourceId = null, replace = false, bulkdownloadDate = null } = options;

  const todayStart = startOfTodayUtc();

  // Issue #44: 統計用（normSourceId 指定時はスキップ）
  let skippedEffectivePast: number | undefined;
  let alreadyAnalyzed: number | undefined;
  if (!normSourceId) {
    const baseWhere = {
      ...(bulkdownloadDate ? { bulkdownloadDate } : {}),
    };
    const [skipped, analyzed] = await Promise.all([
      prisma.normSource.count({
        where: {
          ...baseWhere,
          changes: { none: {} },
          effectiveAt: { lt: todayStart },
        },
      }),
      prisma.normSource.count({
        where: {
          ...baseWhere,
          changes: { some: {} },
          OR: [{ effectiveAt: null }, { effectiveAt: { gte: todayStart } }],
        },
      }),
    ]);
    skippedEffectivePast = skipped;
    alreadyAnalyzed = analyzed;
  }

  const baseWhere = normSourceId
    ? { id: normSourceId }
    : {
        changes: { none: {} },
        // 施行日が今日以降のものだけ（施行日未定＝null も対象）。API コスト削減のため
        OR: [{ effectiveAt: null }, { effectiveAt: { gte: todayStart } }],
        ...(bulkdownloadDate ? { bulkdownloadDate } : {}),
      };

  let sources = await prisma.normSource.findMany({
    where: baseWhere,
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

  // Issue #40: AI レポートが作れない場合は NormChange を登録せず処理を打ち切る
  if (sources.length > 0 && !process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, aborted: true, reason: "AI_REPORT_UNAVAILABLE" };
  }

  try {
    for (const src of sources) {
      let summary = buildSummary(src.title, src.rawText);
      // Issue #65: リスクの種類は AI の primaryRiskType のみで決定（キーワード検知は廃止）
      let riskTypes = {
        survival: false,
        financial: false,
        credit: false,
        other: true,
      };

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

      // Issue #40: AI レポートが 1 件でも作れなかったら登録せず打ち切り
      if (!report) {
        return { ok: false, aborted: true, reason: "AI_REPORT_UNAVAILABLE" };
      }

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
      // 対応重要度は表示しない方針のため、AI が含めていても保存前に除去
      if (report.summary) summary = stripObligationAndLevelFromSummary(report.summary) || report.summary;
      if (report.primaryRiskType) {
        let p = report.primaryRiskType;
        // Issue #67: AI が other を返したとき、キーワードでフォールバック
        if (p === "other") {
          const keywordDetected = detectRiskByKeywords(src.rawText);
          if (keywordDetected) p = keywordDetected;
        }
        riskTypes = {
          survival: p === "survival",
          financial: p === "financial",
          credit: p === "credit",
          other: p === "other",
        };
      }
      // primaryRiskType が無い場合は上記の other: true のまま

      // penaltyDetail: survival/financial/credit のいずれかが true のときのみ penaltyDetailText。すべて other なら null
      const hasSevereRisk = riskTypes.survival || riskTypes.financial || riskTypes.credit;
      const penaltyDetail = hasSevereRisk
        ? (report.penaltyDetailText?.trim() || null)
        : null;

      const change = await prisma.normChange.create({
        data: {
          normSourceId: src.id,
          summary,
          penaltyDetail,
          riskSurvival: riskTypes.survival,
          riskFinancial: riskTypes.financial,
          riskCredit: riskTypes.credit,
          riskOther: riskTypes.other,
          effectiveFrom: src.effectiveAt ?? null,
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

    return {
      ok: true,
      created: created.length,
      ids: created,
      ...(skippedEffectivePast !== undefined && { skippedEffectivePast }),
      ...(alreadyAnalyzed !== undefined && { alreadyAnalyzed }),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/**
 * NormSource から NormChange を生成する処理（API と cron から共通利用）
 * POST /api/analyze および ingest cron の「取り込み後に解析」で使用
 */
import { prisma } from "@/lib/prisma";
import { buildSummary } from "@/lib/analyze";
import { generateReport, generateReportWithKeywordHint } from "@/lib/report-ai";
import {
  detectRiskByKeywords,
  findAllKeywordsInText,
  generatePenaltyDetailForFallback,
} from "@/lib/risk-keyword-fallback";
import { stripObligationAndLevelFromSummary } from "@/lib/risk-display";
import { notifyOnChange } from "@/lib/notify-on-change";

export interface RunAnalyzeOptions {
  /** 指定時はその NormSource のみ解析。省略時は NormChange がまだない全件 */
  normSourceId?: string | null;
  /** true のとき既存 NormChange を削除して再解析（normSourceId 指定時のみ有効） */
  replace?: boolean;
  /** 指定時はこの bulkdownload 日付（yyyyMMdd）の NormSource のみ対象。cron の日単位連動用 */
  bulkdownloadDate?: string | null;
}

export interface RunAnalyzeResult {
  ok: true;
  created: number;
  ids: string[];
  /** 施行日が今日より前のためスキップした件数（normSourceId 指定時は undefined） */
  skippedEffectivePast?: number;
  /** 既に NormChange がある件数（normSourceId 指定時は undefined） */
  alreadyAnalyzed?: number;
}

export interface RunAnalyzeError {
  ok: false;
  error: string;
}

/** AI レポートが作れない場合は登録せず処理を打ち切る */
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

  // OPENAI_API_KEY が未設定の場合は登録せず処理を打ち切る（AI レポートは必須）
  if (sources.length > 0 && !process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, aborted: true, reason: "AI_REPORT_UNAVAILABLE" };
  }

  try {
    for (const src of sources) {
      let summary = buildSummary(src.title, src.rawText);
      // リスクの種類は AI の primaryRiskType のみで決定（キーワード検知は廃止）
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
      let fallbackPenaltyDetail: string | null = null;
      if (report.primaryRiskType) {
        let p = report.primaryRiskType;
        // AI が other を返したとき、キーワードでフォールバック:
        // キーワードヒント付きで AI を再呼び出し。罰則文脈なら具体的な penaltyDetail、手続き規定なら other を維持
        if (p === "other") {
          const keywords = findAllKeywordsInText(src.rawText);
          if (keywords.length > 0) {
            const reportInput = {
              title: src.title,
              type: src.type,
              publishedAt: src.publishedAt.toISOString().slice(0, 10),
              effectiveAt: src.effectiveAt?.toISOString().slice(0, 10) ?? null,
              rawText: src.rawText,
              rawTextPrev: src.rawTextPrev,
            };
            const report2 = await generateReportWithKeywordHint(reportInput, keywords);
            if (report2?.primaryRiskType && report2.primaryRiskType !== "other") {
              p = report2.primaryRiskType;
              fallbackPenaltyDetail =
                report2.penaltyDetailText?.trim() ||
                generatePenaltyDetailForFallback(p) ||
                null;
              if (!fallbackPenaltyDetail) p = "other";
            } else if (!report2) {
              // API 失敗時は従来のキーワードフォールバックにフォールバック
              const keywordDetected = detectRiskByKeywords(src.rawText);
              if (keywordDetected) {
                const generated = generatePenaltyDetailForFallback(keywordDetected);
                if (generated) {
                  p = keywordDetected;
                  fallbackPenaltyDetail = generated;
                }
              }
            }
            // report2 が other を返した場合はフォールバックを却下（手続き規定と判断）
          }
        }
        riskTypes = {
          survival: p === "survival",
          financial: p === "financial",
          credit: p === "credit",
          other: p === "other",
        };
      }
      // primaryRiskType が無い場合は上記の other: true のまま

      // penaltyDetail: survival/financial/credit のいずれかが true のときのみ。AI の penaltyDetailText を優先、フォールバック時は生成したテンプレートを使用
      const hasSevereRisk = riskTypes.survival || riskTypes.financial || riskTypes.credit;
      const penaltyDetail = hasSevereRisk
        ? (report.penaltyDetailText?.trim() || fallbackPenaltyDetail || null)
        : null;

      const tagIds =
        tagIdsToRestore.length > 0 && normSourceId && src.id === normSourceId
          ? tagIdsToRestore
          : [];
      const change = await prisma.$transaction(async (tx) => {
        const c = await tx.normChange.create({
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
        if (tagIds.length > 0) {
          await tx.normChangeTag.createMany({
            data: tagIds.map((tagId) => ({ normChangeId: c.id, tagId })),
            skipDuplicates: true,
          });
        }
        return c;
      });
      created.push(change.id);

      await notifyOnChange(change, src);
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

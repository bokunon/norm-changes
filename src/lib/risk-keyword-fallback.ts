/**
 * Issue #67: AI が primaryRiskType で other を返したときのキーワードフォールバック
 *
 * 条文に罰則・制裁のキーワードが含まれる場合、リスク種別を補正する。
 * 厳しさの順: survival > financial > credit
 */

export type RiskType = "survival" | "financial" | "credit" | "other";

// キーワード（厳しさ順）。表記ゆれ対応
const SURVIVAL_KEYWORDS = [
  "業務停止",
  "業務の停止",
  "免許取消",
  "免許の取消",
  "登録取消",
  "登録の取消",
  "許可取消",
  "許可の取消",
  "営業停止",
  "営業の停止",
  "事業停止",
  "事業の停止",
  "指定取消",
];
const FINANCIAL_KEYWORDS = ["罰金", "課徴金", "過料", "納付金", "科料"];
const CREDIT_KEYWORDS = ["社名公表", "氏名公表", "勧告", "警告", "指名"];

/**
 * 条文からキーワードでリスク種別を検出する。
 * AI が other を返したときのフォールバック用。
 * 該当なしの場合は null。
 */
export function detectRiskByKeywords(text: string | null | undefined): RiskType | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (SURVIVAL_KEYWORDS.some((k) => t.includes(k))) return "survival";
  if (FINANCIAL_KEYWORDS.some((k) => t.includes(k))) return "financial";
  if (CREDIT_KEYWORDS.some((k) => t.includes(k))) return "credit";
  return null;
}

/** Issue #73 試験用: 条文に含まれる全キーワードを検出（重複除去、厳しさ順） */
export function findAllKeywordsInText(text: string | null | undefined): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const found = new Set<string>();
  for (const k of SURVIVAL_KEYWORDS) {
    if (t.includes(k)) found.add(k);
  }
  for (const k of FINANCIAL_KEYWORDS) {
    if (t.includes(k)) found.add(k);
  }
  for (const k of CREDIT_KEYWORDS) {
    if (t.includes(k)) found.add(k);
  }
  return [...found];
}

/**
 * Issue #72: キーワードフォールバック適用時の penaltyDetail をテンプレートで生成する。
 * 生成できない場合は null（その場合はフォールバックを却下する）。
 */
export function generatePenaltyDetailForFallback(riskType: RiskType): string | null {
  if (riskType === "other") return null;
  const templates: Record<Exclude<RiskType, "other">, string> = {
    survival: "条文に業務停止・免許取消・登録取消等の規定があり、事業継続リスクに該当する。",
    financial: "条文に罰金・課徴金・過料・納付金・科料等の規定があり、金銭リスクに該当する。",
    credit: "条文に社名公表・勧告・警告等の規定があり、信用リスクに該当する。",
  };
  return templates[riskType] ?? null;
}

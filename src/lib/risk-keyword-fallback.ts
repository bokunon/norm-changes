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

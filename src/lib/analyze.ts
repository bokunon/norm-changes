/**
 * NormSource から NormChange を生成する MVP ロジック
 * 罰則・義務キーワードで penaltyRisk / obligationLevel を簡易判定
 */

const PENALTY_KEYWORDS = [
  "罰金",
  "懲役",
  "業務停止",
  "登録取消",
  "取消",
  "命令",
  "科料",
  "過料",
];

const OBLIGATION_KEYWORDS = [
  "しなければならない",
  "しなくてはならない",
  "するものとする",
  "従わなければならない",
  "届け出なければならない",
  "報告しなければならない",
];

export function detectPenaltyRisk(text: string | null | undefined): "HIGH" | "MID" | "LOW" | "NONE" {
  if (!text || typeof text !== "string") return "NONE";
  const t = text;
  if (PENALTY_KEYWORDS.some((k) => t.includes(k))) return "HIGH";
  return "NONE";
}

export function detectObligationLevel(text: string | null | undefined): "MUST" | "SHOULD" | "INFO" {
  if (!text || typeof text !== "string") return "INFO";
  const t = text;
  if (OBLIGATION_KEYWORDS.some((k) => t.includes(k))) return "MUST";
  return "INFO";
}

export function buildSummary(title: string, rawText: string | null | undefined): string {
  if (rawText && rawText.length > 0) {
    const excerpt = rawText.slice(0, 300).replace(/\s+/g, " ").trim();
    return excerpt + (rawText.length > 300 ? "…" : "");
  }
  return `${title} の改正・更新`;
}

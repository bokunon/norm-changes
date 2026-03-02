/**
 * NormSource から NormChange を生成するロジック
 * Issue #65: リスクの種類は AI の primaryRiskType のみで判定
 * Issue #68: penaltyRisk / obligationLevel は削除済み
 */
export function buildSummary(title: string, rawText: string | null | undefined): string {
  if (rawText && rawText.length > 0) {
    const excerpt = rawText.slice(0, 300).replace(/\s+/g, " ").trim();
    return excerpt + (rawText.length > 300 ? "…" : "");
  }
  return `${title} の改正・更新`;
}

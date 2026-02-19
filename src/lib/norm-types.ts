/**
 * Issue #27: 法令種別（type）から日本語表示ラベルへのマッピングを共通化
 */

const TYPE_LABELS: Record<string, string> = {
  LAW: "法律",
  ORDINANCE: "政令",
  REGULATION: "省令・規則",
  OTHER: "その他",
};

/**
 * NormSource.type（LAW / ORDINANCE / REGULATION / OTHER）を日本語ラベルに変換する。
 * 未定義の値はそのまま返す。
 */
export function getNormTypeLabelJa(type: string | null | undefined): string {
  if (type == null || type === "") return "—";
  return TYPE_LABELS[type] ?? type;
}

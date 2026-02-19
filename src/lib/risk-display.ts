/**
 * リスク表示用: 当該変更の中で最も厳しいリスクを1つだけ返す
 * 厳しさの順: 事業継続 > 金銭 > レピュテーション > その他
 */
export type RiskDisplay = {
  key: "survival" | "financial" | "credit" | "other";
  label: string;
  className: string;
};

const RISK_ORDER: RiskDisplay[] = [
  {
    key: "survival",
    label: "事業継続リスク（生存）",
    className: "rounded bg-amber-100 dark:bg-amber-900/40 px-2 py-1 text-sm text-amber-800 dark:text-amber-200",
  },
  {
    key: "financial",
    label: "金銭リスク",
    className: "rounded bg-red-100 dark:bg-red-900/40 px-2 py-1 text-sm text-red-800 dark:text-red-200",
  },
  {
    key: "credit",
    label: "レピュテーションリスク（信用）",
    className: "rounded bg-sky-100 dark:bg-sky-900/40 px-2 py-1 text-sm text-sky-800 dark:text-sky-200",
  },
  {
    key: "other",
    label: "その他（手続き変更等）",
    className: "rounded bg-zinc-200 dark:bg-zinc-600 px-2 py-1 text-sm text-zinc-700 dark:text-zinc-300",
  },
];

const RISK_ORDER_SHORT: { key: RiskDisplay["key"]; label: string; className: string }[] = [
  { key: "survival", label: "生存", className: "rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-amber-800 dark:text-amber-200" },
  { key: "financial", label: "金銭", className: "rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-red-800 dark:text-red-200" },
  { key: "credit", label: "信用", className: "rounded bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0.5 text-sky-800 dark:text-sky-200" },
  { key: "other", label: "その他", className: "rounded bg-zinc-200 dark:bg-zinc-600 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300" },
];

type RiskFlags = {
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  riskOther: boolean;
};

/** 詳細ページ用: 最も厳しいリスク1つの表示用オブジェクト */
export function getMostSevereRisk(item: RiskFlags): RiskDisplay | null {
  for (const r of RISK_ORDER) {
    if (r.key === "survival" && item.riskSurvival) return r;
    if (r.key === "financial" && item.riskFinancial) return r;
    if (r.key === "credit" && item.riskCredit) return r;
    if (r.key === "other" && item.riskOther) return r;
  }
  return null;
}

/** 一覧ページ用: 最も厳しいリスク1つ（短いラベル） */
export function getMostSevereRiskShort(item: RiskFlags): (RiskDisplay & { label: string }) | null {
  for (const r of RISK_ORDER_SHORT) {
    if (r.key === "survival" && item.riskSurvival) return r as RiskDisplay & { label: string };
    if (r.key === "financial" && item.riskFinancial) return r as RiskDisplay & { label: string };
    if (r.key === "credit" && item.riskCredit) return r as RiskDisplay & { label: string };
    if (r.key === "other" && item.riskOther) return r as RiskDisplay & { label: string };
  }
  return null;
}

/**
 * リスク詳細（penaltyDetail）の先頭にある程度・義務レベルの表記を除去する。
 * AI が "MID- 〜" "SHOULD 〜" などを返すことがあるため、表示用にクリーンにする。
 */
export function stripRiskLevelFromPenaltyDetail(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";
  let s = text.trim();
  // 先頭の "HIGH-", "MID-", "LOW-", "NONE-", "MUST ", "SHOULD ", "INFO " 等を除去（ハイフン・スペース・コロン付き）
  const prefix = /^(HIGH|MID|LOW|NONE|MUST|SHOULD|INFO)\s*[-–—:\s]+\s*/i;
  while (prefix.test(s)) s = s.replace(prefix, "").trim();
  return s;
}

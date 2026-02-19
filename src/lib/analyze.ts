/**
 * NormSource から NormChange を生成するロジック
 * 罰則・義務キーワードで penaltyRisk / obligationLevel を簡易判定
 * Issue #16/#19: 3軸リスク（生存・金銭・信用）をキーワードで検知
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

/** 生存リスク: 業務停止・免許取消（会社が終わる） */
const SURVIVAL_RISK_KEYWORDS = [
  "業務停止",
  "営業停止",
  "免許取消",
  "登録取消",
  "許可取消",
  "廃止",
  "取り消し",
];

/** 金銭リスク: 罰金・課徴金（キャッシュが飛ぶ） */
const FINANCIAL_RISK_KEYWORDS = [
  "罰金",
  "課徴金",
  "過料",
  "科料",
  "納付金",
  "徴収",
];

/** 信用リスク: 社名公表・勧告（仕事と人が消える） */
const CREDIT_RISK_KEYWORDS = [
  "社名公表",
  "氏名公表",
  "公表",
  "勧告",
  "警告",
  "指名",
  "公表する",
];

export interface RiskTypes {
  survival: boolean;
  financial: boolean;
  credit: boolean;
  other: boolean;
}

/** リスク分類をキーワードで検知（#16 定義）。その他はキーワードでは判定せず AI で付与 */
export function detectRiskTypes(text: string | null | undefined): RiskTypes {
  if (!text || typeof text !== "string") {
    return { survival: false, financial: false, credit: false, other: false };
  }
  const t = text;
  return {
    survival: SURVIVAL_RISK_KEYWORDS.some((k) => t.includes(k)),
    financial: FINANCIAL_RISK_KEYWORDS.some((k) => t.includes(k)),
    credit: CREDIT_RISK_KEYWORDS.some((k) => t.includes(k)),
    other: false, // 手続き変更等は AI レポートで判定
  };
}

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

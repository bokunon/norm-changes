/**
 * e-Gov 法令API（Version 1）のクライアント
 * 更新法令一覧取得: https://laws.e-gov.go.jp/api/1/updatelawlists/{yyyyMMdd}
 */
import { XMLParser } from "fast-xml-parser";

const BASE_URL = "https://laws.e-gov.go.jp/api/1/updatelawlists";

export type LawTypeName = "憲法" | "法律" | "政令" | "勅令" | "府省令" | "規則" | string;

export interface LawNameListInfo {
  LawTypeName: string;
  LawNo: string;
  LawName: string;
  LawNameKana?: string;
  OldLawName?: string;
  PromulgationDate: string; // yyyyMMdd
  AmendName?: string;
  AmendNo?: string;
  AmendPromulgationDate?: string;
  EnforcementDate?: string; // yyyyMMdd
  EnforcementComment?: string;
  LawId: string;
  LawUrl?: string;
  EnforcementFlg?: string; // 0=施行済, 1=未施行
  AuthFlg?: string;
}

export interface UpdateLawListResponse {
  Date: string;
  LawNameListInfo: LawNameListInfo | LawNameListInfo[];
}

function parseDate(yyyyMMdd: string): Date {
  if (!/^\d{8}$/.test(yyyyMMdd)) return new Date(0);
  const y = yyyyMMdd.slice(0, 4);
  const m = yyyyMMdd.slice(4, 6);
  const d = yyyyMMdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`);
}

/**
 * 更新法令一覧取得APIのレスポンスをパースする
 */
function parseUpdateLawListXml(xml: string): { code: string; data: UpdateLawListResponse } | null {
  const parser = new XMLParser({
    ignoreDeclaration: true,
    isArray: (name) => name === "LawNameListInfo",
  });
  const raw = parser.parse(xml);
  const dataRoot = raw?.DataRoot;
  if (!dataRoot?.ApplData) return null;
  const code = dataRoot.Result?.Code ?? "1";
  const appl = dataRoot.ApplData;
  const list = appl.LawNameListInfo;
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return {
    code,
    data: {
      Date: appl.Date ?? "",
      LawNameListInfo: arr,
    },
  };
}

/**
 * 指定日付に更新された法令一覧を取得する
 * @param date yyyyMMdd（2020年11月24日以降、未来日不可）
 */
export async function fetchUpdateLawList(
  date: string
): Promise<{ ok: boolean; data: UpdateLawListResponse | null; error?: string }> {
  if (!/^\d{8}$/.test(date)) {
    return { ok: false, data: null, error: "date は yyyyMMdd で指定してください" };
  }
  const url = `${BASE_URL}/${date}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, data: null, error: `API error ${res.status}: ${text.slice(0, 200)}` };
    }
    const parsed = parseUpdateLawListXml(text);
    if (!parsed) return { ok: false, data: null, error: "XMLのパースに失敗しました" };
    if (parsed.code !== "0") {
      return { ok: false, data: null, error: `API結果コード: ${parsed.code}` };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    return {
      ok: false,
      data: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * API種別名を NormSource.type にマッピング
 */
export function mapLawTypeToNormType(lawTypeName: string): string {
  if (lawTypeName === "法律" || lawTypeName === "憲法") return "LAW";
  if (lawTypeName === "政令" || lawTypeName === "勅令") return "ORDINANCE";
  if (lawTypeName === "府省令" || lawTypeName === "規則") return "REGULATION";
  return "OTHER";
}

export function lawInfoToNormSourceFields(info: LawNameListInfo) {
  const publishedAt = parseDate(info.PromulgationDate);
  const effectiveAt = info.EnforcementDate ? parseDate(info.EnforcementDate) : null;
  return {
    externalId: info.LawId,
    type: mapLawTypeToNormType(info.LawTypeName ?? ""),
    title: info.LawName ?? "",
    number: info.LawNo || null,
    publisher: null as string | null,
    publishedAt,
    effectiveAt: effectiveAt ?? undefined,
    url: info.LawUrl ?? null,
    rawText: null as string | null,
  };
}

/**
 * e-Gov 法令API v2: 改正履歴（law_revisions）と法令本文（law_data）で改正前全文を取得
 * Issue #25
 * 実仕様: GET /api/2/law_revisions/{lawId} → { revisions: [{ law_revision_id, amendment_law_id, ... }] }（新しい順）
 *         GET /api/2/law_data/{law_revision_id} → { law_full_text: { tag, children: [...] } }（JSON）
 */
import { XMLParser } from "fast-xml-parser";
import { parseLawXmlToRawText } from "./bulkdownload";

const API2_BASE = "https://laws.e-gov.go.jp/api/2";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, application/xml, */*",
};

const FETCH_TIMEOUT_MS = 30_000;

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** law_revisions の 1 件（API v2 実レスポンス） */
interface RevisionItem {
  law_revision_id?: string;
  amendment_law_id?: string;
  /** 後方互換・XML 用 */
  revision_id?: string;
  RevisionId?: string;
  [key: string]: unknown;
}

/**
 * 法令の改正履歴一覧を取得（v2 law_revisions）
 * @param lawId 法令ID（例: 342AC0000000081）
 */
export async function fetchLawRevisions(
  lawId: string
): Promise<{ ok: true; revisions: RevisionItem[] } | { ok: false; error: string }> {
  const url = `${API2_BASE}/law_revisions/${encodeURIComponent(lawId)}`;
  try {
    const res = await fetchWithTimeout(url, { next: { revalidate: 0 }, headers: DEFAULT_HEADERS });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `law_revisions ${res.status}: ${text.slice(0, 200)}` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (contentType.includes("application/json")) {
      const data = JSON.parse(text) as Record<string, unknown>;
      const list = data.revisions ?? data.Revisions ?? data.items;
      const revisions = Array.isArray(list) ? (list as RevisionItem[]) : [];
      return { ok: true, revisions };
    }
    if (contentType.includes("xml") || text.trimStart().startsWith("<")) {
      const parser = new XMLParser({ ignoreDeclaration: true, ignoreAttributes: false });
      const parsed = parser.parse(text) as Record<string, unknown>;
      const revs = extractRevisionsFromXml(parsed);
      return { ok: true, revisions: revs };
    }
    return { ok: false, error: "想定外のレスポンス形式です" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function extractRevisionsFromXml(parsed: Record<string, unknown>): RevisionItem[] {
  const out: RevisionItem[] = [];
  function walk(obj: unknown): void {
    if (obj == null) return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    if (typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      if (o["law_revision_id"] != null || o["RevisionId"] != null || o["revision_id"] != null) {
        out.push({
          law_revision_id: String(o["law_revision_id"] ?? o["RevisionId"] ?? o["revision_id"] ?? ""),
          amendment_law_id: String(o["amendment_law_id"] ?? o["AmendmentId"] ?? ""),
          ...o,
        });
        return;
      }
      Object.values(o).forEach(walk);
    }
  }
  walk(parsed);
  return out;
}

/** API v2 law_data の law_full_text（tag/children 木）から条文テキストを再帰的に抽出 */
function extractTextFromLawFullText(node: unknown): string[] {
  const out: string[] = [];
  if (node == null) return out;
  if (typeof node === "string") {
    const t = node.trim();
    if (t) out.push(t);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => out.push(...extractTextFromLawFullText(child)));
    return out;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    const children = o.children ?? o.Children;
    if (children != null) out.push(...extractTextFromLawFullText(children));
    return out;
  }
  return out;
}

/**
 * 指定 revision の法令本文を取得（v2 law_data）
 * @param revisionId 改正ID（revision_id）
 */
export async function fetchLawData(
  revisionId: string
): Promise<{ ok: true; rawText: string } | { ok: false; error: string }> {
  const url = `${API2_BASE}/law_data/${encodeURIComponent(revisionId)}`;
  try {
    const res = await fetchWithTimeout(url, { next: { revalidate: 0 }, headers: DEFAULT_HEADERS });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `law_data ${res.status}: ${text.slice(0, 200)}` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (contentType.includes("application/json")) {
      const data = JSON.parse(text) as Record<string, unknown>;
      const lawFullText = data.law_full_text ?? data.LawFullText;
      if (lawFullText != null && typeof lawFullText === "object") {
        const parts = extractTextFromLawFullText(lawFullText);
        return { ok: true, rawText: parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() };
      }
      const body = (data.body ?? data.rawText ?? data.content ?? data.Body ?? "") as string;
      return { ok: true, rawText: typeof body === "string" ? body : "" };
    }
    if (contentType.includes("xml") || text.trimStart().startsWith("<")) {
      const rawText = parseLawXmlToRawText(text);
      return { ok: true, rawText };
    }
    return { ok: true, rawText: text };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * ZIP で得た「現在の改正」を基準に、一つ前の revision の全文を取得（#25）
 * API v2 の revisions は新しい順のため、「一つ前」= 配列の次の要素（index+1）
 * @param lawId 法令ID
 * @param currentAmendmentRevisionId ZIP の改正ID（amendment_law_id。例: 506CO0000000390）
 */
export async function fetchPreviousRevisionRawText(
  lawId: string,
  currentAmendmentRevisionId: string
): Promise<string | null> {
  const revResult = await fetchLawRevisions(lawId);
  if (!revResult.ok) return null;
  const { revisions } = revResult;
  const idKey = (r: RevisionItem) =>
    (r.law_revision_id ?? r.revision_id ?? r.RevisionId ?? "").toString();
  const amendmentId = (r: RevisionItem) =>
    (r.amendment_law_id ?? (r as Record<string, unknown>).AmendmentId ?? "").toString();
  const currentIndex = revisions.findIndex(
    (r) =>
      amendmentId(r) === currentAmendmentRevisionId ||
      idKey(r).endsWith("_" + currentAmendmentRevisionId)
  );
  if (currentIndex < 0) return null;
  const nextIndex = currentIndex + 1;
  if (nextIndex >= revisions.length) return null;
  const prevRevision = revisions[nextIndex];
  const prevId = idKey(prevRevision);
  if (!prevId) return null;
  const dataResult = await fetchLawData(prevId);
  if (!dataResult.ok) return null;
  return dataResult.rawText || null;
}

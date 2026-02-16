/**
 * e-Gov 法令API v2: 改正履歴（law_revisions）と法令本文（law_data）で改正前全文を取得
 * Issue #25
 * 参照: https://laws.e-gov.go.jp/api/2/swagger-ui
 */
import { XMLParser } from "fast-xml-parser";
import { parseLawXmlToRawText } from "./bulkdownload";

const API2_BASE = "https://laws.e-gov.go.jp/api/2";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, application/xml, */*",
};

/** law_revisions の 1 件（仕様に合わせて調整する） */
interface RevisionItem {
  revision_id?: string;
  RevisionId?: string;
  law_id?: string;
  /** その他の識別子 */
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
    const res = await fetch(url, { next: { revalidate: 0 }, headers: DEFAULT_HEADERS });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `law_revisions ${res.status}: ${text.slice(0, 200)}` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (contentType.includes("application/json")) {
      const data = JSON.parse(text) as unknown;
      const list = Array.isArray(data) ? data : (data as Record<string, unknown>).revisions ?? (data as Record<string, unknown>).Revisions ?? (data as Record<string, unknown>).items;
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
      if (o["RevisionId"] != null || o["revision_id"] != null) {
        out.push({
          revision_id: String(o["revision_id"] ?? o["RevisionId"] ?? ""),
          RevisionId: String(o["RevisionId"] ?? o["revision_id"] ?? ""),
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

/**
 * 指定 revision の法令本文を取得（v2 law_data）
 * @param revisionId 改正ID（revision_id）
 */
export async function fetchLawData(
  revisionId: string
): Promise<{ ok: true; rawText: string } | { ok: false; error: string }> {
  const url = `${API2_BASE}/law_data/${encodeURIComponent(revisionId)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 }, headers: DEFAULT_HEADERS });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `law_data ${res.status}: ${text.slice(0, 200)}` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (contentType.includes("application/json")) {
      const data = JSON.parse(text) as Record<string, unknown>;
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
 * @param lawId 法令ID
 * @param currentAmendmentRevisionId ZIP ディレクトリ名の改正ID（{法令ID}_{日付}_{改正ID} の第3部分）
 */
export async function fetchPreviousRevisionRawText(
  lawId: string,
  currentAmendmentRevisionId: string
): Promise<string | null> {
  const revResult = await fetchLawRevisions(lawId);
  if (!revResult.ok) return null;
  const { revisions } = revResult;
  const idKey = (r: RevisionItem) =>
    (r.revision_id ?? r.RevisionId ?? (r as Record<string, unknown>).AmendmentId ?? "").toString();
  const currentIndex = revisions.findIndex(
    (r) => idKey(r) === currentAmendmentRevisionId || idKey(r).endsWith(currentAmendmentRevisionId)
  );
  if (currentIndex <= 0) return null;
  const prevRevision = revisions[currentIndex - 1];
  const prevId = idKey(prevRevision);
  if (!prevId) return null;
  const dataResult = await fetchLawData(prevId);
  if (!dataResult.ok) return null;
  return dataResult.rawText || null;
}

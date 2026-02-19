/**
 * e-Gov bulkdownload（日付指定・更新法令データ）の取得とパース
 * https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date={yyyyMMdd}&only_xml_flag=true
 * Issue #22, #23 対応
 * Issue #24: ZIP 内 XML 本文の取り込み（NormSource.rawText）
 */
import { gunzipSync } from "node:zlib";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import { XMLParser } from "fast-xml-parser";
import { mapLawTypeToNormType } from "./egov-api";

const BULKDOWNLOAD_URL =
  "https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date={yyyyMMdd}&only_xml_flag=true";

/** CSV 1行をパース（ダブルクォート内のカンマは区切りとみなさない） */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i += 1;
      let cell = "";
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\") {
          i += 1;
          if (i < line.length) cell += line[i];
          i += 1;
          continue;
        }
        cell += line[i];
        i += 1;
      }
      if (i < line.length) i += 1; // 閉じ "
      result.push(cell.trim());
      continue;
    }
    let cell = "";
    while (i < line.length && line[i] !== ",") {
      cell += line[i];
      i += 1;
    }
    result.push(cell.trim());
    i += 1; // カンマ
  }
  return result;
}

/** BOM や前後の空白を除いた列名でヘッダー→インデックスを返す */
function csvHeaderToIndex(header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((name, i) => {
    const normalized = name.replace(/^\uFEFF/, "").trim();
    if (normalized) index[normalized] = i;
  });
  return index;
}

function getCell(row: string[], idx: Record<string, number>, key: string): string {
  const i = idx[key];
  if (i === undefined) return "";
  const v = row[i];
  return typeof v === "string" ? v.trim() : "";
}

/** 漢数字（一〜九、十、二十、三十、十一〜十九、二十一〜二十九、三十一）を数値に。月・日用 */
function kanjiToNumber(s: string): number | null {
  const map: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  const t = s.replace(/\s/g, "");
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  // 十, 二十, 三十
  let n = 0;
  let i = 0;
  if (t === "十") return 10;
  if (t.startsWith("十")) {
    n = 10;
    i = 1;
  } else if (t.startsWith("二十")) {
    n = 20;
    i = 2;
  } else if (t.startsWith("三十")) {
    n = 30;
    i = 2;
  } else if (t.startsWith("四十")) {
    n = 40;
    i = 2;
  }
  while (i < t.length) {
    const c = t[i];
    if (c in map) {
      n += map[c];
      i += 1;
    } else {
      break;
    }
  }
  return i > 0 && n > 0 ? n : null;
}

/**
 * 日付文字列を Date に変換
 * - yyyyMMdd（8桁）→ そのまま
 * - 令和R年M月D日（数字 or 漢数字）→ 西暦に変換（令和1年=2019）
 */
function parseDateString(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  // yyyyMMdd（8桁）
  const digits = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (digits) {
    const [, y, m, d] = digits;
    const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // 令和R年M月D日（数字のみ）
  const reiwaNum = /^令和\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日?$/.exec(t);
  if (reiwaNum) {
    const r = parseInt(reiwaNum[1], 10);
    const month = parseInt(reiwaNum[2], 10);
    const day = parseInt(reiwaNum[3], 10);
    const y = 2018 + r;
    const date = new Date(`${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // 令和R年M月D日（漢数字: 令和七年十二月二十四日）→ X,Y,Z をキャプチャして kanjiToNumber で変換
  const reiwaKanji = /^令和\s*(.+?)\s*年\s*(.+?)\s*月\s*(.+?)\s*日?$/.exec(t);
  if (reiwaKanji) {
    const r = kanjiToNumber(reiwaKanji[1].trim());
    const month = kanjiToNumber(reiwaKanji[2].trim());
    const day = kanjiToNumber(reiwaKanji[3].trim());
    if (r == null || month == null || day == null) return null;
    const y = 2018 + r;
    const date = new Date(`${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // yyyy/M/d や yyyy-MM-dd など
  const slash = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/.exec(t);
  if (slash) {
    const [, y, m, d] = slash;
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** CSV 1行を NormSource 用フィールドに変換（#23: 公示日は改正法令公布日、空なら公布日） */
export interface BulkdownloadRowFields {
  externalId: string | null;
  type: string;
  title: string;
  number: string | null;
  publisher: null;
  publishedAt: Date;
  effectiveAt: Date | null;
  url: string | null;
  /** 改正後全文（ZIP 内 XML から抽出。Issue #24） */
  rawText: string | null;
  /** ZIP ディレクトリ名の改正ID（{法令ID}_{日付}_{改正ID}）。Issue #25 で一つ前の revision 特定に使用 */
  amendmentRevisionId?: string | null;
}

export function csvRowToNormSourceFields(
  row: string[],
  colIndex: Record<string, number>
): BulkdownloadRowFields | null {
  const externalId = getCell(row, colIndex, "法令ID");
  if (!externalId) return null;

  const typeStr = getCell(row, colIndex, "法令種別");
  const title = getCell(row, colIndex, "法令名");
  const number = getCell(row, colIndex, "法令番号") || null;
  const url = getCell(row, colIndex, "本文URL") || null;

  // #23: 公示日は「改正法令公布日」、空なら「公布日」
  const amendDateStr = getCell(row, colIndex, "改正法令公布日");
  const promulgationDateStr = getCell(row, colIndex, "公布日");
  const publishedAt = parseDateString(amendDateStr || promulgationDateStr);
  if (!publishedAt) return null; // 必須

  const effectiveStr = getCell(row, colIndex, "施行日");
  const effectiveAt = effectiveStr ? parseDateString(effectiveStr) : null;

  return {
    externalId,
    type: mapLawTypeToNormType(typeStr),
    title: title || "（無題）",
    number,
    publisher: null,
    publishedAt,
    effectiveAt: effectiveAt ?? null,
    url,
    rawText: null,
    amendmentRevisionId: null,
  };
}

/** 法令標準 XML から条文テキストを再帰的に収集（#24） */
function collectTextFromNode(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    const t = node.trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectTextFromNode(child, out));
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj["#text"] !== undefined) {
      const t = String(obj["#text"]).trim();
      if (t) out.push(t);
    }
    for (const key of Object.keys(obj)) {
      if (key === "#text") continue;
      collectTextFromNode(obj[key], out);
    }
  }
}

/**
 * bulkdownload ZIP 内の法令 XML（Law/LawBody/本則・附則）から条文全文テキストを抽出（#24）
 * 法令標準XMLスキーマに沿った LawBody 内の Article/Paragraph 等からテキストを集める
 */
export function parseLawXmlToRawText(xmlString: string): string {
  const parser = new XMLParser({ ignoreDeclaration: true, ignoreAttributes: true });
  let parsed: unknown;
  try {
    parsed = parser.parse(xmlString);
  } catch {
    return "";
  }
  if (parsed == null || typeof parsed !== "object") return "";
  const law = (parsed as Record<string, unknown>)["Law"];
  if (law == null || typeof law !== "object") return "";
  const lawBody = (law as Record<string, unknown>)["LawBody"];
  if (lawBody == null || typeof lawBody !== "object") return "";
  const out: string[] = [];
  const body = lawBody as Record<string, unknown>;
  ["MainProvision", "SupplProvision", "Preamble", "EnactStatement"].forEach((key) => {
    if (body[key]) collectTextFromNode(body[key], out);
  });
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** yyyyMMdd から ZIP 内の CSV ファイル名（RyyMMdd.csv）を推測。令和年 = 西暦 - 2018 */
function csvFileNameFromDate(yyyyMMdd: string): string {
  const y = parseInt(yyyyMMdd.slice(0, 4), 10);
  const reiwaYear = y - 2018;
  const mm = yyyyMMdd.slice(4, 6);
  const dd = yyyyMMdd.slice(6, 8);
  const r = String(reiwaYear).padStart(2, "0");
  return `R${r}${mm}${dd}.csv`;
}

export interface BulkdownloadListResult {
  ok: true;
  rows: BulkdownloadRowFields[];
  date: string;
}

export interface BulkdownloadListError {
  ok: false;
  error: string;
}

/**
 * 指定日の bulkdownload ZIP を取得し、CSV 一覧をパースして返す
 */
export async function fetchBulkdownloadList(
  yyyyMMdd: string
): Promise<BulkdownloadListResult | BulkdownloadListError> {
  if (!/^\d{8}$/.test(yyyyMMdd)) {
    return { ok: false, error: "date は yyyyMMdd で指定してください" };
  }

  const url = BULKDOWNLOAD_URL.replace("{yyyyMMdd}", yyyyMMdd);
  let buffer: Buffer;
  try {
    // サーバーからの fetch だと e-Gov が空を返すことがあるため、ブラウザ風 User-Agent を付与
    const res = await fetch(url, {
      next: { revalidate: 0 },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/octet-stream,*/*",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `bulkdownload API error ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // レスポンスが空 → 指定日にデータがないか未来日・不正な日付の可能性
  if (buffer.length === 0) {
    return {
      ok: false,
      error:
        "レスポンスが空です。指定した日付にデータがないか、未来日・不正な日付の可能性があります。過去の実在する日付（例: 20230201）で試してください。",
    };
  }

  // サーバーが Content-Encoding: gzip で返す場合、fetch が解凍しない環境では gzip のまま届く
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      buffer = gunzipSync(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `gzip 解凍に失敗しました: ${msg}` };
    }
  }

  // ZIP は先頭が PK (0x50 0x4B)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const preview = buffer.slice(0, 200).toString("utf-8").replace(/[\x00-\x1f]/g, ".");
    return {
      ok: false,
      error: `レスポンスがZIP形式ではありません（${buffer.length} bytes）。先頭: ${preview.slice(0, 100)}`,
    };
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `ZIP の解凍に失敗しました: ${msg}` };
  }

  const entries = zip.getEntries();
  const expectedCsv = csvFileNameFromDate(yyyyMMdd);
  const csvEntry = entries.find((e) => e.entryName === expectedCsv || e.entryName.endsWith(".csv"));
  if (!csvEntry || csvEntry.isDirectory) {
    return { ok: false, error: `ZIP 内に CSV が見つかりません（期待: ${expectedCsv} 等）` };
  }

  // e-Gov bulkdownload の CSV は Shift_JIS (CP932) のことが多い。UTF-8 で読めない場合は CP932 で試す
  const csvBuffer = csvEntry.getData();
  const rawBuf = Buffer.isBuffer(csvBuffer) ? csvBuffer : Buffer.from(csvBuffer);
  let csvText = rawBuf.toString("utf-8");
  if (!csvText.includes("法令ID") && !csvText.replace(/^\uFEFF/, "").includes("法令ID")) {
    csvText = iconv.decode(rawBuf, "cp932");
  }
  csvText = csvText.replace(/^\uFEFF/, ""); // BOM 除去
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: "CSV にデータ行がありません" };
  }

  const header = parseCsvLine(lines[0]);
  const colIndex = csvHeaderToIndex(header);
  if (colIndex["法令ID"] === undefined) {
    return {
      ok: false,
      error: `CSV のヘッダーに「法令ID」が見つかりません。列: ${header.join("|").slice(0, 200)}`,
    };
  }
  const rows: BulkdownloadRowFields[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const fields = csvRowToNormSourceFields(row, colIndex);
    if (fields) rows.push(fields);
  }

  // #24: ZIP 内の法令別 XML から改正後全文（rawText）と改正ID（#25 用）を付与
  const xmlByLawId: Record<string, { rawText: string; amendmentRevisionId: string }> = {};
  for (const entry of entries) {
    if (entry.isDirectory || !entry.entryName.endsWith(".xml")) continue;
    const pathParts = entry.entryName.split("/");
    const dirName = pathParts.length >= 2 ? pathParts[0] : entry.entryName.replace(/\.xml$/i, "");
    const segs = dirName.split("_");
    if (segs.length < 3) continue;
    const [lawId, , ...revisionParts] = segs;
    const amendmentRevisionId = revisionParts.join("_");
    const xmlBuffer = entry.getData();
    const xmlBuf = Buffer.isBuffer(xmlBuffer) ? xmlBuffer : Buffer.from(xmlBuffer);
    let xmlText = xmlBuf.toString("utf-8");
    if (!xmlText || (xmlText.charCodeAt(0) !== 0x3c && !xmlText.includes("<Law"))) {
      xmlText = iconv.decode(xmlBuf, "cp932");
    }
    const rawText = parseLawXmlToRawText(xmlText);
    if (lawId && (rawText || amendmentRevisionId)) {
      xmlByLawId[lawId] = { rawText, amendmentRevisionId };
    }
  }
  rows.forEach((r) => {
    if (r.externalId && xmlByLawId[r.externalId]) {
      r.rawText = xmlByLawId[r.externalId].rawText || null;
      r.amendmentRevisionId = xmlByLawId[r.externalId].amendmentRevisionId || null;
    }
  });

  // 0件のときはサーバー側とブラウザ側で取得内容が違う可能性があるため、デバッグ用に先頭を返す
  if (rows.length === 0 && lines.length >= 2) {
    const firstData = parseCsvLine(lines[1]);
    return {
      ok: false,
      error: `取り込み0件でした。ヘッダーと先頭行の対応が取れていない可能性があります。ヘッダー: ${header.join("|").slice(0, 200)} / 1行目: ${firstData.join("|").slice(0, 200)}`,
    };
  }

  return { ok: true, rows, date: yyyyMMdd };
}

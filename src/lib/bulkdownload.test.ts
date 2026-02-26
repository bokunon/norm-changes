/**
 * bulkdownload の単体テスト＋取得試験（fetch モック）
 * Issue #22, #23 のパース・日付・列マッピングと、ZIP 取得〜行返却までの流れを検証する
 * Issue #24: ZIP 内 XML 本文パース・rawText 付与のテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import {
  csvRowToNormSourceFields,
  fetchBulkdownloadList,
  parseLawXmlToRawText,
  type BulkdownloadRowFields,
} from "./bulkdownload";

// --- 単体: CSV 1行 → NormSource 用フィールド ---

describe("csvRowToNormSourceFields", () => {
  const header = [
    "法令種別",
    "法令番号",
    "法令名",
    "法令名読み",
    "旧法令名",
    "公布日",
    "改正法令名",
    "改正法令番号",
    "改正法令公布日",
    "施行日",
    "施行日備考",
    "法令ID",
    "本文URL",
    "未施行",
  ];
  const colIndex: Record<string, number> = {};
  header.forEach((name, i) => {
    colIndex[name] = i;
  });

  it("法令ID・改正法令公布日・施行日がある行を正しくマッピングする", () => {
    const row = [
      "法律",
      "昭和四十二年法律第八十一号",
      "住民基本台帳法",
      "ジューミンキホンタイチョウホウ",
      "",
      "昭和四十二年七月二十五日",
      "",
      "",
      "令和8年1月14日",
      "令和8年2月1日",
      "",
      "342AC0000000081",
      "https://laws.e-gov.go.jp/law/342AC0000000081",
      "",
    ];
    const got = csvRowToNormSourceFields(row, colIndex);
    expect(got).not.toBeNull();
    expect((got as BulkdownloadRowFields).externalId).toBe("342AC0000000081");
    expect((got as BulkdownloadRowFields).title).toBe("住民基本台帳法");
    expect((got as BulkdownloadRowFields).type).toBe("LAW");
    expect((got as BulkdownloadRowFields).publishedAt).toEqual(
      new Date("2026-01-14T00:00:00.000Z")
    );
    expect((got as BulkdownloadRowFields).effectiveAt).toEqual(
      new Date("2026-02-01T00:00:00.000Z")
    );
  });

  it("#23: 改正法令公布日が空のときは公布日を使う", () => {
    const row = [
      "府省令",
      "令和七年総務省令第十号",
      "例規",
      "",
      "",
      "20260110",
      "",
      "",
      "", // 改正法令公布日は空
      "20260201",
      "",
      "999AC0000000001",
      "https://example.com",
      "",
    ];
    const got = csvRowToNormSourceFields(row, colIndex);
    expect(got).not.toBeNull();
    expect((got as BulkdownloadRowFields).publishedAt).toEqual(
      new Date("2026-01-10T00:00:00.000Z")
    );
  });

  it("法令IDが空の行は null を返す", () => {
    const row = ["法律", "", "無題", "", "", "", "", "", "", "", "", "", "", ""];
    const got = csvRowToNormSourceFields(row, colIndex);
    expect(got).toBeNull();
  });

  it("公示日がパースできない行は null を返す", () => {
    const row = [
      "法律",
      "番号",
      "題名",
      "",
      "",
      "不正な日付",
      "",
      "",
      "これも不正",
      "",
      "",
      "342AC0000000081",
      "",
      "",
    ];
    const got = csvRowToNormSourceFields(row, colIndex);
    expect(got).toBeNull();
  });

  it("令和七年十二月二十四日（漢数字）の日付をパースする", () => {
    const row = [
      "法律",
      "番号",
      "題名",
      "",
      "",
      "令和七年十二月二十四日",
      "",
      "",
      "令和七年十二月二十四日",
      "令和八年四月一日",
      "",
      "507AC1000000096",
      "",
      "",
    ];
    const got = csvRowToNormSourceFields(row, colIndex);
    expect(got).not.toBeNull();
    expect((got as BulkdownloadRowFields).publishedAt).toEqual(
      new Date("2025-12-24T00:00:00.000Z")
    );
    expect((got as BulkdownloadRowFields).effectiveAt).toEqual(
      new Date("2026-04-01T00:00:00.000Z")
    );
  });

  it("yyyyMMdd 形式の日付をパースする", () => {
    const row = [
      "法律",
      "番号",
      "題名",
      "",
      "",
      "20230101",
      "",
      "",
      "20241231",
      "20250201",
      "",
      "342AC0000000081",
      "",
      "",
    ];
    const got = csvRowToNormSourceFields(row, colIndex);
    expect(got).not.toBeNull();
    expect((got as BulkdownloadRowFields).publishedAt).toEqual(
      new Date("2024-12-31T00:00:00.000Z")
    );
    expect((got as BulkdownloadRowFields).effectiveAt).toEqual(
      new Date("2025-02-01T00:00:00.000Z")
    );
  });
});

// --- #24: 法令 XML から条文テキスト抽出 ---

describe("parseLawXmlToRawText", () => {
  it("Law/LawBody/MainProvision 内のテキストを抽出する", () => {
    const xml = `<?xml version="1.0"?>
<Law>
  <LawBody>
    <MainProvision>
      <Article Num="1">
        <Paragraph Num="1">第一条　この法律は、住民の住所に関する事項を定める。</Paragraph>
      </Article>
      <Article Num="2">
        <Paragraph Num="1">第二条　市町村は、住民基本台帳を備える。</Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>`;
    const got = parseLawXmlToRawText(xml);
    expect(got).toContain("第一条");
    expect(got).toContain("住民の住所に関する事項を定める");
    expect(got).toContain("第二条");
    expect(got).toContain("住民基本台帳を備える");
  });

  it("空または不正な XML の場合は空文字を返す", () => {
    expect(parseLawXmlToRawText("")).toBe("");
    expect(parseLawXmlToRawText("<html></html>")).toBe("");
    expect(parseLawXmlToRawText("not xml")).toBe("");
  });
});

// --- 取得試験: fetch モックで ZIP を返し、解凍〜CSV パース〜行取得まで通す ---

describe("fetchBulkdownloadList（取得試験・fetch モック）", () => {
  const date = "20260114";
  const csvFileName = "R080114.csv"; // 令和8年01月14日

  /** e-Gov の CSV ヘッダー＋1行の UTF-8 サンプル（取得試験用） */
  const csvUtf8 =
    "法令種別,法令番号,法令名,法令名読み,旧法令名,公布日,改正法令名,改正法令番号,改正法令公布日,施行日,施行日備考,法令ID,本文URL,未施行\n" +
    "法律,昭和四十二年法律第八十一号,住民基本台帳法,ジューミンキホンタイチョウホウ,,,改正名,,令和8年1月14日,令和8年2月1日,,342AC0000000081,https://laws.e-gov.go.jp/law/342AC0000000081,";

  function buildZipBuffer(csvContent: string, fileName: string): Buffer {
    const zip = new AdmZip();
    zip.addFile(fileName, Buffer.from(csvContent, "utf-8"));
    return zip.toBuffer();
  }

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (!url.includes("bulkdownload") || !url.includes(date)) {
          return { ok: false, status: 404, text: async () => "Not Found" };
        }
        const zipBuffer = buildZipBuffer(csvUtf8, csvFileName);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => zipBuffer,
        };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("指定日の bulkdownload URL を叩き、ZIP 解凍・CSV パースで行が返る", async () => {
    const result = await fetchBulkdownloadList(date);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    const first = result.rows[0];
    expect(first.externalId).toBe("342AC0000000081");
    expect(first.title).toBe("住民基本台帳法");
    expect(first.publishedAt).toEqual(new Date("2026-01-14T00:00:00.000Z"));
    expect(first.effectiveAt).toEqual(new Date("2026-02-01T00:00:00.000Z"));
  });

  it("日付が yyyyMMdd でない場合はエラー", async () => {
    const r1 = await fetchBulkdownloadList("2026-01-14");
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.error).toContain("yyyyMMdd");

    const r2 = await fetchBulkdownloadList("");
    expect(r2.ok).toBe(false);
  });

  it("fetch が 404 のときはエラー", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      })
    );
    const result = await fetchBulkdownloadList(date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("404");
  });

  it("fetch が空 body のときは 0 件成功扱い（その日に公示が無い日）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    );
    const result = await fetchBulkdownloadList(date);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toEqual([]);
      expect(result.date).toBe(date);
    }
  });

  it("Shift_JIS (CP932) の CSV が ZIP に入っている場合も正しくデコードされて行が返る", async () => {
    const csvShiftJis = iconv.encode(csvUtf8, "cp932");
    const zip = new AdmZip();
    zip.addFile(csvFileName, Buffer.from(csvShiftJis));
    const zipBuffer = zip.toBuffer();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => zipBuffer,
      })
    );
    const result = await fetchBulkdownloadList(date);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].externalId).toBe("342AC0000000081");
    expect(result.rows[0].title).toBe("住民基本台帳法");
  });

  it("#24: ZIP に CSV と法令別 XML が含まれる場合、行に rawText と amendmentRevisionId が付与される", async () => {
    const lawId = "342AC0000000081";
    const revisionId = "507AC0000000032";
    const dirName = `${lawId}_20260114_${revisionId}`;
    const xmlContent = `<?xml version="1.0"?>
<Law><LawBody>
  <MainProvision>
    <Article Num="1"><Paragraph Num="1">第一条　本文テキスト。</Paragraph></Article>
  </MainProvision>
</LawBody></Law>`;
    const zip = new AdmZip();
    zip.addFile(csvFileName, Buffer.from(csvUtf8, "utf-8"));
    zip.addFile(`${dirName}/${dirName}.xml`, Buffer.from(xmlContent, "utf-8"));
    const zipBuffer = zip.toBuffer();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => zipBuffer,
      })
    );
    const result = await fetchBulkdownloadList(date);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    const row = result.rows[0];
    expect(row.externalId).toBe(lawId);
    expect(row.rawText).toContain("第一条");
    expect(row.rawText).toContain("本文テキスト");
    expect(row.amendmentRevisionId).toBe(revisionId);
  });
});

// --- 実際のデータを使った取得試験（オプション: 手動で有効化） ---
// 環境変数 RUN_BULKDOWNLOAD_E2E=1 で e-Gov bulkdownload に実際にリクエストし、
// ZIP 解凍・CSV/XML パース・rawText 付与まで通ることを確認する。
const runE2E = process.env.RUN_BULKDOWNLOAD_E2E === "1";
describe.skipIf(!runE2E)("fetchBulkdownloadList（実データ取得・e-Gov に接続）", () => {
  it("過去日付で bulkdownload を取得し、行と rawText が返る", async () => {
    const date = "20230201";
    const result = await fetchBulkdownloadList(date);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
    if (result.rows.length > 0 && result.rows[0].rawText) {
      expect(result.rows[0].rawText.length).toBeGreaterThan(0);
    }
  }, 60_000);
});

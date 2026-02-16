/**
 * bulkdownload の単体テスト＋取得試験（fetch モック）
 * Issue #22, #23 のパース・日付・列マッピングと、ZIP 取得〜行返却までの流れを検証する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import {
  csvRowToNormSourceFields,
  fetchBulkdownloadList,
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

  it("fetch が空 body のときはエラー", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    );
    const result = await fetchBulkdownloadList(date);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("空");
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
});

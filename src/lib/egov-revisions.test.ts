/**
 * e-Gov 改正履歴・法令本文取得の単体テスト（fetch モック）
 * Issue #25
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchLawRevisions,
  fetchLawData,
  fetchPreviousRevisionRawText,
} from "./egov-revisions";

describe("fetchLawRevisions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("JSON で revisions 配列が返る場合に正しくパースする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            revisions: [
              { law_revision_id: "id1", amendment_law_id: "rev1" },
              { law_revision_id: "id2", amendment_law_id: "rev2" },
            ],
          }),
      })
    );
    const result = await fetchLawRevisions("342AC0000000081");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions[0].law_revision_id).toBe("id1");
  });

  it("API が 404 の場合は ok: false を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      })
    );
    const result = await fetchLawRevisions("unknown");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("404");
  });
});

describe("fetchLawData", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("JSON の law_full_text（tag/children）から条文テキストを抽出する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            law_full_text: {
              tag: "Law",
              children: [
                { tag: "LawBody", children: [{ tag: "Article", children: ["第一条", "本文"] }] },
              ],
            },
          }),
      })
    );
    const result = await fetchLawData("335CO0000000260_20230401_504CO0000000365");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawText).toContain("第一条");
    expect(result.rawText).toContain("本文");
  });

  it("XML 本文が返る場合に parseLawXmlToRawText でテキストを返す", async () => {
    const xml = `<Law><LawBody><MainProvision><Article><Paragraph>条文本文</Paragraph></Article></MainProvision></LawBody></Law>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/xml" }),
        text: async () => xml,
      })
    );
    const result = await fetchLawData("rev1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawText).toContain("条文本文");
  });
});

describe("fetchPreviousRevisionRawText", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("law_revisions")) {
          return {
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            text: async () =>
              JSON.stringify({
                revisions: [
                  { law_revision_id: "lawId_20260214_currentRev", amendment_law_id: "currentRev" },
                  { law_revision_id: "lawId_20240101_prevRev", amendment_law_id: "prevRev" },
                ],
              }),
          };
        }
        if (url.includes("law_data")) {
          return {
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            text: async () =>
              JSON.stringify({
                law_full_text: {
                  tag: "Law",
                  children: [{ tag: "LawBody", children: ["改正前の条文"] }],
                },
              }),
          };
        }
        return { ok: false, status: 404, text: async () => "Not Found" };
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("現在の revision（配列先頭）の一つ前（配列2番目）の全文を取得する", async () => {
    const text = await fetchPreviousRevisionRawText("342AC0000000081", "currentRev");
    expect(text).toContain("改正前の条文");
  });

  it("現在の revision が配列の最後（最も古い）の場合は null を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            revisions: [
              { law_revision_id: "onlyOne", amendment_law_id: "onlyOne" },
            ],
          }),
      })
    );
    const text = await fetchPreviousRevisionRawText("342AC0000000081", "onlyOne");
    expect(text).toBeNull();
  });
});

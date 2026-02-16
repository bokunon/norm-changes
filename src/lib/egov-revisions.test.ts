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
              { revision_id: "rev1", date: "20250101" },
              { revision_id: "rev2", date: "20260214" },
            ],
          }),
      })
    );
    const result = await fetchLawRevisions("342AC0000000081");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revisions).toHaveLength(2);
    expect(result.revisions[0].revision_id).toBe("rev1");
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
                  { revision_id: "prevRev", date: "20240101" },
                  { revision_id: "currentRev", date: "20260214" },
                ],
              }),
          };
        }
        if (url.includes("law_data")) {
          return {
            ok: true,
            headers: new Headers({ "content-type": "application/xml" }),
            text: async () =>
              "<Law><LawBody><MainProvision><Article><Paragraph>改正前の条文</Paragraph></Article></MainProvision></LawBody></Law>",
          };
        }
        return { ok: false, status: 404, text: async () => "Not Found" };
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("現在の revision の一つ前の全文を取得する", async () => {
    const text = await fetchPreviousRevisionRawText("342AC0000000081", "currentRev");
    expect(text).toContain("改正前の条文");
  });

  it("現在の revision が先頭の場合は null を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({ revisions: [{ revision_id: "onlyOne", date: "20260214" }] }),
      })
    );
    const text = await fetchPreviousRevisionRawText("342AC0000000081", "onlyOne");
    expect(text).toBeNull();
  });
});

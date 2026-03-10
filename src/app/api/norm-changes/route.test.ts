/**
 * Issue #105: GET /api/norm-changes 統合テスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    normChange: {
      findMany: mockFindMany,
    },
  },
}));

import { GET } from "./route";

const makeSrc = (overrides = {}) => ({
  id: "src-1",
  type: "LAW",
  title: "テスト法令",
  number: "令和7年法律第1号",
  publishedAt: new Date("2026-01-10T00:00:00Z"),
  effectiveAt: new Date("2027-04-01T00:00:00Z"),
  url: "https://example.com",
  ...overrides,
});

const makeChange = (overrides = {}) => ({
  id: "change-1",
  summary: "テストサマリー",
  riskSurvival: false,
  riskFinancial: true,
  riskCredit: false,
  riskOther: false,
  penaltyDetail: "罰金規定あり",
  effectiveFrom: new Date("2027-04-01T00:00:00Z"),
  createdAt: new Date("2026-01-10T12:00:00Z"),
  normSource: makeSrc(),
  tags: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/norm-changes");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe("GET /api/norm-changes", () => {
  it("デフォルトで NormChange 一覧を返す", async () => {
    const changes = [makeChange()];
    mockFindMany.mockResolvedValue(changes);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("change-1");
    expect(body.items[0].summary).toBe("テストサマリー");
    expect(body.items[0].riskFinancial).toBe(true);
  });

  it("空の結果のとき items が空配列で返る", async () => {
    mockFindMany.mockResolvedValue([]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeUndefined();
  });

  it("risk=survival フィルタで riskSurvival: true の WHERE 条件が付く", async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(makeRequest({ risk: "survival" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ riskSurvival: true }],
        }),
      })
    );
  });

  it("risk=financial,credit で複数リスクフィルタが OR になる", async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(makeRequest({ risk: "financial,credit" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { riskFinancial: true },
            { riskCredit: true },
          ]),
        }),
      })
    );
  });

  it("from/to パラメータで publishedAt 範囲フィルタが付く", async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(makeRequest({ from: "2026-01-01", to: "2026-01-31" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          normSource: expect.objectContaining({
            publishedAt: {
              gte: new Date("2026-01-01T00:00:00Z"),
              lte: new Date("2026-01-31T00:00:00Z"),
            },
          }),
        }),
      })
    );
  });

  it("enforcement=not_yet で effectiveAt フィルタが付く", async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(makeRequest({ enforcement: "not_yet" }));

    const callArg = mockFindMany.mock.calls[0][0];
    expect(callArg.where.normSource?.OR).toBeDefined();
  });

  it("enforcement=enforced で effectiveAt フィルタが付く", async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(makeRequest({ enforcement: "enforced" }));

    const callArg = mockFindMany.mock.calls[0][0];
    expect(callArg.where.normSource?.effectiveAt).toBeDefined();
  });

  it("limit より1件多いとき nextCursor が設定される", async () => {
    // limit=2 を渡し、3件返ってきた場合、2件返して nextCursor を設定
    const changes = [
      makeChange({ id: "change-1" }),
      makeChange({ id: "change-2" }),
      makeChange({ id: "change-3" }),
    ];
    mockFindMany.mockResolvedValue(changes);

    const response = await GET(makeRequest({ limit: "2" }));
    const body = await response.json();

    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBe("change-2");
  });

  it("tagId パラメータで tags フィルタが付く", async () => {
    mockFindMany.mockResolvedValue([]);

    await GET(makeRequest({ tagId: "tag-123" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tags: { some: { tagId: "tag-123" } },
        }),
      })
    );
  });

  it("normSource が null のとき normSource フィールドは null を返す", async () => {
    const changeNoSrc = makeChange({ normSource: null });
    mockFindMany.mockResolvedValue([changeNoSrc]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.items[0].normSource).toBeNull();
  });

  it("tags の情報が展開されて返る", async () => {
    const changeWithTags = makeChange({
      tags: [
        {
          tag: {
            id: "tag-1",
            type: "INDUSTRY",
            key: "finance",
            labelJa: "金融",
            description: null,
          },
        },
      ],
    });
    mockFindMany.mockResolvedValue([changeWithTags]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.items[0].tags).toHaveLength(1);
    expect(body.items[0].tags[0].id).toBe("tag-1");
    expect(body.items[0].tags[0].labelJa).toBe("金融");
  });
});

/**
 * Issue #105: GET/POST /api/notification-filters 統合テスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany, mockCreate } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationFilter: {
      findMany: mockFindMany,
      create: mockCreate,
    },
  },
}));

import { GET, POST } from "./route";

const baseFilter = {
  id: "filter-1",
  name: "テストフィルタ",
  publishedFrom: null,
  publishedTo: null,
  riskSurvival: true,
  riskFinancial: false,
  riskCredit: false,
  riskOther: false,
  normType: null,
  tagId: null,
  createdAt: new Date("2026-01-10T12:00:00Z"),
  updatedAt: new Date("2026-01-10T12:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body?: unknown, method = "POST") {
  return new Request("http://localhost/api/notification-filters", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/notification-filters", () => {
  it("フィルタ一覧を返す", async () => {
    mockFindMany.mockResolvedValue([baseFilter]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("filter-1");
    expect(body.items[0].name).toBe("テストフィルタ");
    expect(body.items[0].riskSurvival).toBe(true);
  });

  it("フィルタが空のとき空配列を返す", async () => {
    mockFindMany.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.items).toEqual([]);
  });

  it("publishedFrom/publishedTo が Date のとき ISO 日付文字列（YYYY-MM-DD）で返す", async () => {
    const filterWithDates = {
      ...baseFilter,
      publishedFrom: new Date("2026-01-01T00:00:00Z"),
      publishedTo: new Date("2026-12-31T00:00:00Z"),
    };
    mockFindMany.mockResolvedValue([filterWithDates]);

    const response = await GET();
    const body = await response.json();

    expect(body.items[0].publishedFrom).toBe("2026-01-01");
    expect(body.items[0].publishedTo).toBe("2026-12-31");
  });

  it("DB エラーのとき 500 を返す", async () => {
    mockFindMany.mockRejectedValue(new Error("DB接続エラー"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.message).toBeDefined();
  });
});

describe("POST /api/notification-filters", () => {
  it("有効なリクエストでフィルタを作成して返す", async () => {
    const newFilter = {
      ...baseFilter,
      id: "filter-new",
      name: "新フィルタ",
    };
    mockCreate.mockResolvedValue(newFilter);

    const response = await POST(
      makeRequest({ name: "新フィルタ", riskSurvival: true })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.item.id).toBe("filter-new");
    expect(body.item.name).toBe("新フィルタ");
  });

  it("name が空のとき 400 を返す", async () => {
    const response = await POST(makeRequest({ name: "" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.message).toBeDefined();
  });

  it("name が存在しないとき 400 を返す", async () => {
    const response = await POST(makeRequest({ riskSurvival: true }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("不正な JSON のとき 400 を返す", async () => {
    const request = new Request("http://localhost/api/notification-filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("publishedFrom/publishedTo（ISO datetime 形式）が Date に変換されて保存される", async () => {
    const newFilter = {
      ...baseFilter,
      name: "日付フィルタ",
      publishedFrom: new Date("2026-01-01T00:00:00Z"),
      publishedTo: new Date("2026-12-31T00:00:00Z"),
    };
    mockCreate.mockResolvedValue(newFilter);

    const response = await POST(
      makeRequest({
        name: "日付フィルタ",
        publishedFrom: "2026-01-01T00:00:00Z",
        publishedTo: "2026-12-31T00:00:00Z",
      })
    );
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedFrom: new Date("2026-01-01T00:00:00Z"),
          publishedTo: new Date("2026-12-31T00:00:00Z"),
        }),
      })
    );
  });

  it("riskSurvival=true が保存される", async () => {
    mockCreate.mockResolvedValue({
      ...baseFilter,
      name: "リスクフィルタ",
      riskSurvival: true,
    });

    await POST(makeRequest({ name: "リスクフィルタ", riskSurvival: true }));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          riskSurvival: true,
          riskFinancial: false,
          riskCredit: false,
          riskOther: false,
        }),
      })
    );
  });

  it("normType が保存される", async () => {
    mockCreate.mockResolvedValue({
      ...baseFilter,
      name: "タイプフィルタ",
      normType: "LAW",
      tagId: null,
    });

    await POST(
      makeRequest({ name: "タイプフィルタ", normType: "LAW" })
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          normType: "LAW",
        }),
      })
    );
  });

  it("normType が未指定のとき null として保存される", async () => {
    mockCreate.mockResolvedValue({
      ...baseFilter,
      name: "空タイプ",
      normType: null,
    });

    await POST(makeRequest({ name: "空タイプ" }));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          normType: null,
        }),
      })
    );
  });

  it("DB エラーのとき 500 を返す", async () => {
    mockCreate.mockRejectedValue(new Error("DB書き込みエラー"));

    const response = await POST(makeRequest({ name: "テスト" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.message).toBeDefined();
  });
});

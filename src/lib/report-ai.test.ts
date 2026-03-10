/**
 * Issue #103: report-ai.ts のユニットテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/risk-display", () => ({
  stripObligationAndLevelFromSummary: vi.fn((s: string) => s),
}));

// OpenAI クライアントのモック: chat.completions.create をモック可能にする
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
    constructor(_opts: unknown) {}
  }
  return { default: MockOpenAI };
});

import { generateReport, generateReportWithKeywordHint } from "@/lib/report-ai";

const baseInput = {
  title: "テスト法令",
  type: "LAW",
  publishedAt: "2026-01-10",
  effectiveAt: "2027-04-01",
  rawText: "条文テキスト",
  rawTextPrev: null,
};

function makeCompletionResponse(content: string) {
  return {
    choices: [{ message: { content } }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateReport", () => {
  it("OPENAI_API_KEY が未設定のとき null を返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await generateReport(baseInput);
    expect(result).toBeNull();
  });

  it("OpenAI の JSON レスポンスを正しくパースして返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const responseJson = JSON.stringify({
      summary: "テストサマリー",
      actionItems: [
        { text: "アクション1", source: "amendment" },
        { text: "アクション2", source: "existing" },
      ],
      detailedRecommendations: [
        { action: "詳細アクション", basis: "第1条", source: "amendment" },
      ],
      primaryRiskType: "financial",
      penaltyDetailText: "罰金規定あり",
    });

    mockCreate.mockResolvedValue(makeCompletionResponse(responseJson));

    const result = await generateReport(baseInput);

    expect(result).not.toBeNull();
    expect(result?.summary).toBe("テストサマリー");
    expect(result?.actionItems).toHaveLength(2);
    expect(result?.actionItems[0]).toEqual({ text: "アクション1", source: "amendment" });
    expect(result?.actionItems[1]).toEqual({ text: "アクション2", source: "existing" });
    expect(result?.detailedRecommendations).toHaveLength(1);
    expect(result?.detailedRecommendations[0].action).toBe("詳細アクション");
    expect(result?.primaryRiskType).toBe("financial");
    expect(result?.penaltyDetailText).toBe("罰金規定あり");
  });

  it("不正な JSON のとき null を返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockCreate.mockResolvedValue(makeCompletionResponse("これはJSONではない"));

    const result = await generateReport(baseInput);
    expect(result).toBeNull();
  });

  it("choices content が null のとき null を返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

    const result = await generateReport(baseInput);
    expect(result).toBeNull();
  });

  it("actionItems が文字列配列（レガシー形式）のとき正しく処理される", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const responseJson = JSON.stringify({
      summary: "サマリー",
      actionItems: ["テキスト形式のアクション1", "テキスト形式のアクション2"],
      detailedRecommendations: [],
      primaryRiskType: "other",
      penaltyDetailText: null,
    });

    mockCreate.mockResolvedValue(makeCompletionResponse(responseJson));

    const result = await generateReport(baseInput);

    expect(result).not.toBeNull();
    expect(result?.actionItems).toHaveLength(2);
    expect(result?.actionItems[0]).toEqual({ text: "テキスト形式のアクション1", source: undefined });
    expect(result?.actionItems[1]).toEqual({ text: "テキスト形式のアクション2", source: undefined });
  });

  it("penaltyDetailText が null のとき undefined として返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const responseJson = JSON.stringify({
      summary: "サマリー",
      actionItems: [],
      detailedRecommendations: [],
      primaryRiskType: "other",
      penaltyDetailText: null,
    });

    mockCreate.mockResolvedValue(makeCompletionResponse(responseJson));

    const result = await generateReport(baseInput);

    expect(result).not.toBeNull();
    // penaltyDetailText が null のとき: parsed.penaltyDetailText === null → undefined を返す
    expect(result?.penaltyDetailText).toBeUndefined();
  });

  it("primaryRiskType が不正な値のとき undefined として返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const responseJson = JSON.stringify({
      summary: "サマリー",
      actionItems: [],
      detailedRecommendations: [],
      primaryRiskType: "invalid_risk",
      penaltyDetailText: null,
    });

    mockCreate.mockResolvedValue(makeCompletionResponse(responseJson));

    const result = await generateReport(baseInput);

    expect(result).not.toBeNull();
    expect(result?.primaryRiskType).toBeUndefined();
  });

  it("effectiveAt が null のときも正常に動作する", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const responseJson = JSON.stringify({
      summary: "サマリー",
      actionItems: [],
      detailedRecommendations: [],
      primaryRiskType: "other",
      penaltyDetailText: null,
    });

    mockCreate.mockResolvedValue(makeCompletionResponse(responseJson));

    const result = await generateReport({ ...baseInput, effectiveAt: null });
    expect(result).not.toBeNull();
  });

  it("API 呼び出しが例外を投げたとき null を返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockCreate.mockRejectedValue(new Error("API呼び出しエラー"));

    const result = await generateReport(baseInput);
    expect(result).toBeNull();
  });
});

describe("generateReportWithKeywordHint", () => {
  it("OPENAI_API_KEY が未設定のとき null を返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await generateReportWithKeywordHint(baseInput, ["罰金", "業務停止"]);
    expect(result).toBeNull();
  });

  it("キーワードが空のとき generateReport と同じ動作をする", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const responseJson = JSON.stringify({
      summary: "サマリー",
      actionItems: [],
      detailedRecommendations: [],
      primaryRiskType: "other",
      penaltyDetailText: null,
    });

    mockCreate.mockResolvedValue(makeCompletionResponse(responseJson));

    const result = await generateReportWithKeywordHint(baseInput, []);
    expect(result).not.toBeNull();
  });

  it("キーワードヒントをプロンプトに追加してレポートを生成する", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const responseJson = JSON.stringify({
      summary: "サマリー",
      actionItems: [{ text: "アクション", source: "amendment" }],
      detailedRecommendations: [],
      primaryRiskType: "financial",
      penaltyDetailText: "罰金規定に基づくリスク",
    });

    mockCreate.mockResolvedValue(makeCompletionResponse(responseJson));

    const result = await generateReportWithKeywordHint(baseInput, ["罰金", "業務停止"]);

    expect(result).not.toBeNull();
    expect(result?.primaryRiskType).toBe("financial");
    expect(result?.penaltyDetailText).toBe("罰金規定に基づくリスク");

    // キーワードヒントがプロンプトに含まれていることを確認
    const callArg = mockCreate.mock.calls[0][0];
    const userMessage = callArg.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("罰金");
    expect(userMessage.content).toContain("業務停止");
    expect(userMessage.content).toContain("補足");
  });

  it("不正な JSON のとき null を返す", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockCreate.mockResolvedValue(makeCompletionResponse("不正なJSON"));

    const result = await generateReportWithKeywordHint(baseInput, ["罰金"]);
    expect(result).toBeNull();
  });
});

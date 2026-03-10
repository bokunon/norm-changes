/**
 * Issue #102: run-analyze.ts のユニットテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma");
vi.mock("@/lib/report-ai");
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@/lib/analyze", () => ({ buildSummary: vi.fn((_title: string, _text: unknown) => "テスト要約") }));
vi.mock("@/lib/notification-filter-match", () => ({ matchesNotificationFilter: vi.fn(() => false) }));
vi.mock("@/lib/risk-display", () => ({ stripObligationAndLevelFromSummary: vi.fn((s: string) => s) }));

import { prisma } from "@/lib/prisma";
import { generateReport } from "@/lib/report-ai";
import { runAnalyzeForPendingSources } from "@/lib/run-analyze";

const mockPrisma = prisma as unknown as {
  normSource: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  normChange: { create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  normChangeTag: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  notificationFilter: { findMany: ReturnType<typeof vi.fn> };
};
const mockGenerateReport = generateReport as ReturnType<typeof vi.fn>;

const baseSrc = {
  id: "src-1",
  title: "テスト法令",
  type: "LAW",
  publishedAt: new Date("2026-01-10T00:00:00Z"),
  effectiveAt: new Date("2027-04-01T00:00:00Z"),
  rawText: "条文テキスト",
  rawTextPrev: null,
};

const baseReport = {
  summary: "テストサマリー",
  actionItems: [{ text: "アクション1", source: "amendment" as const }],
  detailedRecommendations: [{ action: "詳細アクション", basis: "条文根拠", source: "amendment" as const }],
  primaryRiskType: "financial" as const,
  penaltyDetailText: "罰金規定あり",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no notification filters
  mockPrisma.notificationFilter.findMany.mockResolvedValue([]);
  mockPrisma.normChange.findUnique.mockResolvedValue({ id: "change-1", tags: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runAnalyzeForPendingSources", () => {
  describe("OPENAI_API_KEY が未設定のとき", () => {
    it("ソースがあれば AI_REPORT_UNAVAILABLE を返す", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      mockPrisma.normSource.count.mockResolvedValue(0);
      mockPrisma.normSource.findMany.mockResolvedValue([baseSrc]);

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result as { aborted?: boolean }).aborted).toBe(true);
        expect((result as { reason?: string }).reason).toBe("AI_REPORT_UNAVAILABLE");
      }
    });

    it("ソースが空なら ok: true で created=0 を返す", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      mockPrisma.normSource.count.mockResolvedValue(0);
      mockPrisma.normSource.findMany.mockResolvedValue([]);

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.created).toBe(0);
      }
    });
  });

  describe("generateReport が null を返すとき", () => {
    it("AI_REPORT_UNAVAILABLE を返す", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normSource.count.mockResolvedValue(0);
      mockPrisma.normSource.findMany.mockResolvedValue([baseSrc]);
      mockGenerateReport.mockResolvedValue(null);

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result as { aborted?: boolean }).aborted).toBe(true);
        expect((result as { reason?: string }).reason).toBe("AI_REPORT_UNAVAILABLE");
      }
    });
  });

  describe("正常系: primaryRiskType に応じたリスクフラグ", () => {
    it("financial のとき riskFinancial=true で NormChange を作成する", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normSource.count.mockResolvedValue(0);
      mockPrisma.normSource.findMany.mockResolvedValue([baseSrc]);
      mockGenerateReport.mockResolvedValue({ ...baseReport, primaryRiskType: "financial" });
      mockPrisma.normChange.create.mockResolvedValue({ id: "change-1" });

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.created).toBe(1);
        expect(result.ids).toEqual(["change-1"]);
      }

      expect(mockPrisma.normChange.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            riskFinancial: true,
            riskSurvival: false,
            riskCredit: false,
            riskOther: false,
          }),
        })
      );
    });

    it("survival のとき riskSurvival=true で NormChange を作成する", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normSource.count.mockResolvedValue(0);
      mockPrisma.normSource.findMany.mockResolvedValue([baseSrc]);
      mockGenerateReport.mockResolvedValue({ ...baseReport, primaryRiskType: "survival", penaltyDetailText: "業務停止規定あり" });
      mockPrisma.normChange.create.mockResolvedValue({ id: "change-2" });

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(true);
      expect(mockPrisma.normChange.create).toHaveBeenCalledWith(
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

    it("credit のとき riskCredit=true で NormChange を作成する", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normSource.count.mockResolvedValue(0);
      mockPrisma.normSource.findMany.mockResolvedValue([baseSrc]);
      mockGenerateReport.mockResolvedValue({ ...baseReport, primaryRiskType: "credit", penaltyDetailText: "社名公表規定あり" });
      mockPrisma.normChange.create.mockResolvedValue({ id: "change-3" });

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(true);
      expect(mockPrisma.normChange.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            riskCredit: true,
            riskSurvival: false,
            riskFinancial: false,
            riskOther: false,
          }),
        })
      );
    });

    it("other のとき riskOther=true で NormChange を作成する", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normSource.count.mockResolvedValue(0);
      mockPrisma.normSource.findMany.mockResolvedValue([
        { ...baseSrc, rawText: "手続き規定のみ" },
      ]);
      mockGenerateReport.mockResolvedValue({ ...baseReport, primaryRiskType: "other", penaltyDetailText: null });
      mockPrisma.normChange.create.mockResolvedValue({ id: "change-4" });

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(true);
      expect(mockPrisma.normChange.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            riskOther: true,
            riskSurvival: false,
            riskFinancial: false,
            riskCredit: false,
          }),
        })
      );
    });
  });

  describe("replace=true", () => {
    it("normSourceId なしのとき error を返す", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normSource.findMany.mockResolvedValue([baseSrc]);

      const result = await runAnalyzeForPendingSources({ replace: true });

      expect(result.ok).toBe(false);
      if (!result.ok && !("aborted" in result)) {
        expect(result.error).toContain("normSourceId");
      }
    });

    it("normSourceId 付きのとき既存 NormChange を削除してから再作成する", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normChangeTag.findMany.mockResolvedValue([]);
      mockPrisma.normChange.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.normSource.findMany.mockResolvedValue([baseSrc]);
      mockGenerateReport.mockResolvedValue(baseReport);
      mockPrisma.normChange.create.mockResolvedValue({ id: "change-new" });

      const result = await runAnalyzeForPendingSources({ replace: true, normSourceId: "src-1" });

      expect(result.ok).toBe(true);
      expect(mockPrisma.normChange.deleteMany).toHaveBeenCalledWith({ where: { normSourceId: "src-1" } });
    });
  });

  describe("effectiveAt が過去のソースのスキップカウント", () => {
    it("normSourceId なしのとき skippedEffectivePast と alreadyAnalyzed が返る", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      // count calls: first for skipped, second for analyzed
      mockPrisma.normSource.count
        .mockResolvedValueOnce(3)  // skippedEffectivePast
        .mockResolvedValueOnce(2); // alreadyAnalyzed
      mockPrisma.normSource.findMany.mockResolvedValue([]);

      const result = await runAnalyzeForPendingSources();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.skippedEffectivePast).toBe(3);
        expect(result.alreadyAnalyzed).toBe(2);
      }
    });

    it("normSourceId 指定時は skippedEffectivePast / alreadyAnalyzed が undefined", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");
      mockPrisma.normSource.findMany.mockResolvedValue([]);

      const result = await runAnalyzeForPendingSources({ normSourceId: "src-1" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.skippedEffectivePast).toBeUndefined();
        expect(result.alreadyAnalyzed).toBeUndefined();
      }
    });
  });
});

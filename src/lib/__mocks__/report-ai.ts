import { vi } from "vitest";
import type { ReportOutput } from "../report-ai";

export const generateReport = vi.fn<[], Promise<ReportOutput | null>>();
export const generateReportWithKeywordHint = vi.fn<[], Promise<ReportOutput | null>>();

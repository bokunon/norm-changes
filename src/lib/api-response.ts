import { NextResponse } from "next/server";

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  ABORTED: "ABORTED",
  BAD_REQUEST: "BAD_REQUEST",
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

export function apiError(
  code: ErrorCodeType,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ ok: false, code, message }, { status });
}

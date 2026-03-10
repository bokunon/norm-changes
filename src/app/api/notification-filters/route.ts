/**
 * Slack 通知用フィルタの一覧取得・作成（Issue #30）
 * GET /api/notification-filters … 一覧
 * POST /api/notification-filters … 新規作成
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ErrorCode } from "@/lib/api-response";
import { NotificationFilterCreateSchema } from "@/lib/schemas";

function toIsoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Prisma クライアントに notificationFilter が含まれているか（古い generate で undefined になることがある） */
function hasNotificationFilter(): boolean {
  return typeof (prisma as { notificationFilter?: unknown }).notificationFilter !== "undefined";
}

export async function GET() {
  if (!hasNotificationFilter()) {
    return apiError(
      ErrorCode.INTERNAL_ERROR,
      "Prisma クライアントに NotificationFilter がありません。`npx prisma generate` を実行してから再デプロイしてください。",
      503
    );
  }
  try {
    const list = await prisma.notificationFilter.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      ok: true,
      items: list.map((f) => ({
        id: f.id,
        name: f.name,
        publishedFrom: toIsoDate(f.publishedFrom),
        publishedTo: toIsoDate(f.publishedTo),
        riskSurvival: f.riskSurvival,
        riskFinancial: f.riskFinancial,
        riskCredit: f.riskCredit,
        riskOther: f.riskOther,
        normType: f.normType,
        tagId: f.tagId,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[notification-filters] GET 失敗:", e instanceof Error ? e.message : String(e));
    return apiError(ErrorCode.INTERNAL_ERROR, "サーバーエラーが発生しました", 500);
  }
}

export async function POST(request: Request) {
  if (!hasNotificationFilter()) {
    return apiError(
      ErrorCode.INTERNAL_ERROR,
      "Prisma クライアントに NotificationFilter がありません。`npx prisma generate` を実行してから再デプロイしてください。",
      503
    );
  }
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(ErrorCode.BAD_REQUEST, "Invalid JSON", 400);
  }

  const parsed = NotificationFilterCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues.map((e: { message: string }) => e.message).join(", ") },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const publishedFrom = body.publishedFrom ? new Date(body.publishedFrom) : null;
  const publishedTo = body.publishedTo ? new Date(body.publishedTo) : null;

  try {
    const filter = await prisma.notificationFilter.create({
      data: {
        name: body.name,
        publishedFrom: publishedFrom ?? undefined,
        publishedTo: publishedTo ?? undefined,
        riskSurvival: body.riskSurvival,
        riskFinancial: body.riskFinancial,
        riskCredit: body.riskCredit,
        riskOther: body.riskOther,
        normType: body.normType ?? null,
        tagId: body.tagId ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      item: {
      id: filter.id,
      name: filter.name,
      publishedFrom: toIsoDate(filter.publishedFrom),
      publishedTo: toIsoDate(filter.publishedTo),
      riskSurvival: filter.riskSurvival,
      riskFinancial: filter.riskFinancial,
      riskCredit: filter.riskCredit,
      riskOther: filter.riskOther,
      normType: filter.normType,
      tagId: filter.tagId,
      createdAt: filter.createdAt.toISOString(),
      updatedAt: filter.updatedAt.toISOString(),
    },
  });
  } catch (e) {
    console.error("[notification-filters] POST 失敗:", e instanceof Error ? e.message : String(e));
    return apiError(ErrorCode.INTERNAL_ERROR, "サーバーエラーが発生しました", 500);
  }
}

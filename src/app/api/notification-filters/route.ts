/**
 * Slack 通知用フィルタの一覧取得・作成（Issue #30）
 * GET /api/notification-filters … 一覧
 * POST /api/notification-filters … 新規作成
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toIsoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Prisma クライアントに notificationFilter が含まれているか（古い generate で undefined になることがある） */
function hasNotificationFilter(): boolean {
  return typeof (prisma as { notificationFilter?: unknown }).notificationFilter !== "undefined";
}

export async function GET() {
  if (!hasNotificationFilter()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Prisma クライアントに NotificationFilter がありません。`npx prisma generate` を実行してから再デプロイしてください。",
      },
      { status: 503 }
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
        normType: f.normType,
        tagId: f.tagId,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!hasNotificationFilter()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Prisma クライアントに NotificationFilter がありません。`npx prisma generate` を実行してから再デプロイしてください。",
      },
      { status: 503 }
    );
  }
  let body: {
    name: string;
    publishedFrom?: string | null;
    publishedTo?: string | null;
    riskSurvival?: boolean;
    riskFinancial?: boolean;
    riskCredit?: boolean;
    normType?: string | null;
    tagId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "name は必須です" }, { status: 400 });
  }

  const publishedFrom = parseYyyyMMdd(body.publishedFrom);
  const publishedTo = parseYyyyMMdd(body.publishedTo);

  try {
    const filter = await prisma.notificationFilter.create({
      data: {
        name,
        publishedFrom: publishedFrom ?? undefined,
        publishedTo: publishedTo ?? undefined,
        riskSurvival: body.riskSurvival === true,
        riskFinancial: body.riskFinancial === true,
        riskCredit: body.riskCredit === true,
        normType: body.normType && String(body.normType).trim() ? body.normType.trim() : null,
        tagId: body.tagId && String(body.tagId).trim() ? body.tagId.trim() : null,
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
      normType: filter.normType,
      tagId: filter.tagId,
      createdAt: filter.createdAt.toISOString(),
      updatedAt: filter.updatedAt.toISOString(),
    },
  });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

function parseYyyyMMdd(s: string | null | undefined): Date | null {
  if (s == null || typeof s !== "string") return null;
  const normalized = s.replace(/-/g, "").trim();
  if (!/^\d{8}$/.test(normalized)) return null;
  return new Date(
    `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T00:00:00Z`
  );
}

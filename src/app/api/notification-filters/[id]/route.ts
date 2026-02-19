/**
 * Slack 通知用フィルタの取得・削除（Issue #30）
 * GET /api/notification-filters/[id] … 1件取得
 * DELETE /api/notification-filters/[id] … 削除
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toIsoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filter = await prisma.notificationFilter.findUnique({ where: { id } });
    if (!filter) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.notificationFilter.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
}

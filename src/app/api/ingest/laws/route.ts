/**
 * e-Gov bulkdownload で日付指定の更新法令一覧を取得し、NormSource に保存する
 * GET /api/ingest/laws?date=yyyyMMdd
 * Issue #22: bulkdownload（ZIP解凍・CSVパース）に切り替え
 * Issue #23: 公示日は CSV「改正法令公布日」で保存（空なら「公布日」）
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBulkdownloadList } from "@/lib/bulkdownload";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const yyyyMMdd = date ?? formatDate(new Date());

  const result = await fetchBulkdownloadList(yyyyMMdd);
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.error ?? "取得に失敗しました",
      hint: "e-Gov bulkdownload の障害や日付指定（yyyyMMdd）の誤り、ZIP/CSV形式変更の可能性があります。",
    });
  }

  const items = result.rows;
  let created = 0;
  let updated = 0;

  for (const fields of items) {
    const existing = await prisma.normSource.findUnique({
      where: { externalId: fields.externalId ?? undefined },
    });
    if (existing) {
      await prisma.normSource.update({
        where: { id: existing.id },
        data: {
          title: fields.title,
          number: fields.number,
          publishedAt: fields.publishedAt,
          effectiveAt: fields.effectiveAt ?? null,
          url: fields.url,
          updatedAt: new Date(),
        },
      });
      updated += 1;
    } else {
      await prisma.normSource.create({
        data: {
          externalId: fields.externalId ?? null,
          type: fields.type,
          title: fields.title,
          number: fields.number,
          publisher: fields.publisher,
          publishedAt: fields.publishedAt,
          effectiveAt: fields.effectiveAt ?? null,
          url: fields.url,
          rawText: fields.rawText,
        },
      });
      created += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    date: yyyyMMdd,
    total: items.length,
    created,
    updated,
    skipped: 0,
  });
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

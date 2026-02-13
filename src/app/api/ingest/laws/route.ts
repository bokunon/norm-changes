/**
 * e-Gov 更新法令一覧を取得し、NormSource に保存する
 * GET /api/ingest/laws?date=yyyyMMdd
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchUpdateLawList,
  lawInfoToNormSourceFields,
  type LawNameListInfo,
} from "@/lib/egov-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const yyyyMMdd = date ?? formatDate(new Date());

  const result = await fetchUpdateLawList(yyyyMMdd);
  if (!result.ok || !result.data) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "取得に失敗しました" },
      { status: 400 }
    );
  }

  const list = result.data.LawNameListInfo;
  const items = Array.isArray(list) ? list : [list];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const info of items as LawNameListInfo[]) {
    const fields = lawInfoToNormSourceFields(info);
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
    skipped,
  });
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

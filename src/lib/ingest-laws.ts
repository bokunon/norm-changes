/**
 * 日付指定で e-Gov bulkdownload から更新法令一覧を取得し NormSource に upsert する
 * GET /api/ingest/laws および 洗い替えスクリプトから利用
 */
import { prisma } from "@/lib/prisma";
import { fetchBulkdownloadList } from "@/lib/bulkdownload";
import { fetchPreviousRevisionRawText } from "@/lib/egov-revisions";

export interface IngestResult {
  ok: true;
  date: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface IngestError {
  ok: false;
  error: string;
}

export interface IngestOptions {
  /** 改正前全文取得の直後に待機するミリ秒（洗い替え時に e-Gov API 負荷軽減用） */
  delayAfterPrevMs?: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 指定日（yyyyMMdd）の更新法令を bulkdownload から取得し NormSource に保存する
 * 改正前全文（rawTextPrev）の取得は e-Gov API v2 を都度叩くため時間がかかる
 */
export async function runIngestForDate(
  yyyyMMdd: string,
  options?: IngestOptions
): Promise<IngestResult | IngestError> {
  const result = await fetchBulkdownloadList(yyyyMMdd);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "取得に失敗しました",
    };
  }

  const items = result.rows;
  let created = 0;
  let updated = 0;
  const delayMs = options?.delayAfterPrevMs ?? 0;

  for (const fields of items) {
    const existing = await prisma.normSource.findUnique({
      where: { externalId: fields.externalId ?? undefined },
    });
    // #25: 改正前全文を law_revisions / law_data で取得（ZIP の改正IDがある場合のみ）
    let rawTextPrev: string | null = null;
    if (fields.externalId && fields.amendmentRevisionId) {
      try {
        rawTextPrev = await fetchPreviousRevisionRawText(
          fields.externalId,
          fields.amendmentRevisionId
        );
        if (delayMs > 0) await delay(delayMs);
      } catch {
        rawTextPrev = null;
      }
    }
    const updateData = {
      title: fields.title,
      number: fields.number,
      publishedAt: fields.publishedAt,
      effectiveAt: fields.effectiveAt ?? null,
      url: fields.url,
      rawText: fields.rawText ?? null,
      rawTextPrev: rawTextPrev ?? null,
    };
    if (existing) {
      await prisma.normSource.update({
        where: { id: existing.id },
        data: { ...updateData, updatedAt: new Date() },
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
          rawText: fields.rawText ?? null,
          rawTextPrev: rawTextPrev ?? null,
        },
      });
      created += 1;
    }
  }

  return {
    ok: true,
    date: yyyyMMdd,
    total: items.length,
    created,
    updated,
    skipped: 0,
  };
}

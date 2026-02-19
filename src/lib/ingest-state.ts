/**
 * ingest cron の「前回どこまで取り込んだか」を DB で保持する
 * 前回の続きから前日まで取り込むために使用
 */
import { prisma } from "@/lib/prisma";

const INGEST_STATE_ID = "default";

/**
 * 最後に取り込みに成功した日（yyyyMMdd）を返す。未設定なら null
 */
export async function getLastSuccessfulIngestDate(): Promise<string | null> {
  const row = await prisma.ingestState.findUnique({
    where: { id: INGEST_STATE_ID },
  });
  return row?.lastSuccessfulDate ?? null;
}

/**
 * 指定日（yyyyMMdd）まで取り込み済みとして記録する
 */
export async function setLastSuccessfulIngestDate(yyyyMMdd: string): Promise<void> {
  await prisma.ingestState.upsert({
    where: { id: INGEST_STATE_ID },
    create: { id: INGEST_STATE_ID, lastSuccessfulDate: yyyyMMdd },
    update: { lastSuccessfulDate: yyyyMMdd },
  });
}

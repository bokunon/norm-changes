/**
 * Issue #56, #63: 長時間クエリ用の DB 接続ユーティリティ
 * refresh-ingest と cron の両方で利用
 */
import { prisma } from "@/lib/prisma";

/** statement_timeout を 10 分に延長（長時間 ingest 対策） */
export async function setStatementTimeoutLong(): Promise<void> {
  await prisma.$executeRawUnsafe("SET statement_timeout = '600s'");
}

/** 接続をリフレッシュしてプールから新しい接続を取得 */
export async function refreshConnection(): Promise<void> {
  await prisma.$disconnect();
  await setStatementTimeoutLong();
}

/**
 * 法令データのみ削除する（Option 2 の洗い替え用）
 * - NormSource を削除（Cascade で NormChange, NormChangeTag も削除）
 * - IngestState を削除（次回 cron は「前日」から取り込む想定）
 * - Tag, User, UserFilter, NotificationFilter は残す
 *
 * 使い方:
 *   npx tsx scripts/reset-ingest-data.ts
 * 前提: .env に DATABASE_URL が設定されていること
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const normCount = await prisma.normSource.count();

  console.log("法令データのリセットを実行します。");
  console.log("  NormSource（および関連 NormChange, NormChangeTag）: %d 件削除", normCount);

  await prisma.normSource.deleteMany({});

  try {
    await prisma.ingestState.deleteMany({});
    console.log("  IngestState: 削除");
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2021") {
      console.log("  IngestState: テーブルが存在しないためスキップ");
    } else {
      throw e;
    }
  }

  console.log("完了しました。");
  console.log("次に、取得可能な全期間を取り込む場合:");
  console.log("  npm run refresh:ingest -- 20201124 <昨日のyyyyMMdd>");
  console.log("（e-Gov bulkdownload の利用可能開始日は 2020年11月24日です）");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

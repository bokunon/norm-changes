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
  const state = await prisma.ingestState.findUnique({ where: { id: "default" } });

  console.log("法令データのリセットを実行します。");
  console.log("  NormSource（および関連 NormChange, NormChangeTag）: %d 件削除", normCount);
  console.log("  IngestState: %s", state ? "削除" : "なし（スキップ）");

  await prisma.normSource.deleteMany({});
  await prisma.ingestState.deleteMany({});

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

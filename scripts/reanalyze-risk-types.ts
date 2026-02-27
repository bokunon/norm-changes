/**
 * Issue #65: リスク判定仕様変更に伴う洗替スクリプト
 *
 * キーワード検知廃止・primaryRiskType を「改正により新たに発生したリスク」に限定した
 * 仕様変更後、既存 NormChange を再解析するためのスクリプト。
 *
 * 実行タイミング（ingest との兼ね合い等）は別チケットで検討。
 *
 * 使い方:
 *   # bulkdownload 日付で指定（ingest の日付と連動）
 *   npx tsx scripts/reanalyze-risk-types.ts --bulkdownload 20250625
 *
 *   # 公示日で指定（reanalyze-from-date.ts と同様）
 *   npx tsx scripts/reanalyze-risk-types.ts --from-date 20240101
 *
 *   # 先頭 N 件スキップ（再開用）
 *   npx tsx scripts/reanalyze-risk-types.ts --from-date 20240101 --skip 100
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function parseArgs(): {
  bulkdownloadDate?: string;
  fromDate?: string;
  skip: number;
} {
  const args = process.argv.slice(2);
  let bulkdownloadDate: string | undefined;
  let fromDate: string | undefined;
  let skip = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bulkdownload" && args[i + 1]) {
      bulkdownloadDate = args[i + 1];
      i++;
    } else if (args[i] === "--from-date" && args[i + 1]) {
      fromDate = args[i + 1];
      i++;
    } else if (args[i] === "--skip" && args[i + 1]) {
      skip = Math.max(0, parseInt(args[i + 1], 10)) || 0;
      i++;
    }
  }

  return { bulkdownloadDate, fromDate, skip };
}

async function main() {
  const { bulkdownloadDate, fromDate, skip } = parseArgs();

  if (!bulkdownloadDate && !fromDate) {
    console.error(`使い方:
  npx tsx scripts/reanalyze-risk-types.ts --bulkdownload yyyyMMdd
  npx tsx scripts/reanalyze-risk-types.ts --from-date yyyyMMdd
  npx tsx scripts/reanalyze-risk-types.ts --from-date yyyyMMdd --skip N`);
    process.exit(1);
  }

  if (bulkdownloadDate && !/^\d{8}$/.test(bulkdownloadDate)) {
    console.error("--bulkdownload は yyyyMMdd 形式で指定してください");
    process.exit(1);
  }
  if (fromDate && !/^\d{8}$/.test(fromDate)) {
    console.error("--from-date は yyyyMMdd 形式で指定してください");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { runAnalyzeForPendingSources, isAnalyzeAborted } = await import("../src/lib/run-analyze");

  type Where = { bulkdownloadDate?: string; publishedAt?: { gte: Date } };
  const where: Where = {};
  if (bulkdownloadDate) where.bulkdownloadDate = bulkdownloadDate;
  if (fromDate) {
    where.publishedAt = {
      gte: new Date(
        `${fromDate.slice(0, 4)}-${fromDate.slice(4, 6)}-${fromDate.slice(6, 8)}T00:00:00Z`
      ),
    };
  }

  const sources = await prisma.normSource.findMany({
    where,
    orderBy: { publishedAt: "asc" },
    select: { id: true, title: true, publishedAt: true, bulkdownloadDate: true },
  });

  if (sources.length === 0) {
    console.log("該当する NormSource は 0 件です。");
    process.exit(0);
  }

  const toProcess = skip > 0 ? sources.slice(skip) : sources;
  if (toProcess.length === 0) {
    console.log("スキップ後に対象は 0 件です（skip=%d, 総数=%d）。", skip, sources.length);
    process.exit(0);
  }

  const criteria = bulkdownloadDate
    ? `bulkdownloadDate=${bulkdownloadDate}`
    : `publishedAt >= ${fromDate}`;
  console.log("Issue #65 洗替: %s の NormSource %d 件を再解析します。\n", criteria, toProcess.length);

  let done = 0;
  for (let i = 0; i < toProcess.length; i++) {
    const src = toProcess[i];
    const oneBased = skip + i + 1;
    const pub = src.publishedAt.toISOString().slice(0, 10);
    process.stdout.write(
      `[${oneBased}/${sources.length}] ${src.id.slice(0, 12)}… ${pub} ${src.title.slice(0, 40)}… `
    );
    const result = await runAnalyzeForPendingSources({ normSourceId: src.id, replace: true });
    if (isAnalyzeAborted(result)) {
      console.error("\n\nAI レポートを生成できません（API キー未設定または失敗）。打ち切り。");
      process.exit(1);
    }
    if (!result.ok) {
      console.error("エラー:", result.error);
      continue;
    }
    done += result.created;
    console.log("ok (created %d)", result.created);
  }

  console.log("\n完了: %d 件再解析、NormChange %d 件作成。", toProcess.length, done);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

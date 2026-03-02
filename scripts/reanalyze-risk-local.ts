/**
 * Issue #67: リスク判定の洗替スクリプト（ローカル用）
 *
 * プロンプト修正・validateRiskTypeInText 廃止後のリスク判定で、
 * 既存 NormChange を再解析する。
 *
 * ローカル DB に対して実行。.env の DATABASE_URL, OPENAI_API_KEY を設定すること。
 *
 * 使い方:
 *   # 全件（未施行のみ）
 *   npx tsx scripts/reanalyze-risk-local.ts
 *
 *   # 公示日で絞り込み
 *   npx tsx scripts/reanalyze-risk-local.ts --from-date 20240101
 *
 *   # 先頭 5 件だけ試す（ローカル検証用）
 *   npx tsx scripts/reanalyze-risk-local.ts --limit 5
 *
 *   # 続きから再開
 *   npx tsx scripts/reanalyze-risk-local.ts --from-date 20240101 --resume
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const PROGRESS_FILE = path.resolve(__dirname, "reanalyze-risk-local.progress.json");

type Progress = { criteria: string; processed: number; total: number; lastUpdated: string };

function parseArgs(): {
  fromDate?: string;
  limit?: number;
  skip: number;
  resume: boolean;
} {
  const args = process.argv.slice(2);
  let fromDate: string | undefined;
  let limit: number | undefined;
  let skip = 0;
  let resume = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from-date" && args[i + 1]) {
      fromDate = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = Math.max(1, parseInt(args[i + 1], 10)) || undefined;
      i++;
    } else if (args[i] === "--skip" && args[i + 1]) {
      skip = Math.max(0, parseInt(args[i + 1], 10)) || 0;
      i++;
    } else if (args[i] === "--resume") {
      resume = true;
    }
  }

  return { fromDate, limit, skip, resume };
}

function readProgress(): Progress | null {
  try {
    const raw = fs.readFileSync(PROGRESS_FILE, "utf-8");
    return JSON.parse(raw) as Progress;
  } catch {
    return null;
  }
}

function writeProgress(p: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...p, lastUpdated: new Date().toISOString() }, null, 2));
}

function clearProgress(): void {
  try {
    fs.unlinkSync(PROGRESS_FILE);
  } catch {
    /* ignore */
  }
}

async function main() {
  const { fromDate, limit, skip: skipArg, resume } = parseArgs();

  // 未指定時は 2020年以降を対象（実質的に全件に近い）
  const fromDateStr = fromDate ?? "20200101";
  if (!/^\d{8}$/.test(fromDateStr)) {
    console.error("--from-date は yyyyMMdd 形式で指定してください");
    process.exit(1);
  }

  const criteria = `publishedAt >= ${fromDateStr}`;

  let skip = skipArg;
  if (resume && skip === 0) {
    const prog = readProgress();
    if (prog && prog.criteria === criteria && prog.processed > 0) {
      skip = prog.processed;
      console.log("プログレスを読み込み: %d 件まで実施済み → %d 件目から再開\n", skip, skip + 1);
    }
  }

  const { prisma } = await import("../src/lib/prisma");
  const { runAnalyzeForPendingSources, isAnalyzeAborted } = await import("../src/lib/run-analyze");

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const sources = await prisma.normSource.findMany({
    where: {
      publishedAt: {
        gte: new Date(
          `${fromDateStr.slice(0, 4)}-${fromDateStr.slice(4, 6)}-${fromDateStr.slice(6, 8)}T00:00:00Z`
        ),
      },
      // 未施行: 施行日未定 or 施行日が今日以降
      OR: [{ effectiveAt: null }, { effectiveAt: { gte: todayStart } }],
      // 既に NormChange があるもの（洗替対象）
      changes: { some: {} },
    },
    orderBy: { publishedAt: "asc" },
    select: { id: true, title: true, publishedAt: true },
  });

  if (sources.length === 0) {
    console.log("該当する NormSource は 0 件です。");
    process.exit(0);
  }

  const toProcess = limit ? sources.slice(skip, skip + limit) : skip > 0 ? sources.slice(skip) : sources;
  if (toProcess.length === 0) {
    console.log("スキップ後に対象は 0 件です（skip=%d, limit=%s, 総数=%d）。", skip, limit ?? "なし", sources.length);
    clearProgress();
    process.exit(0);
  }

  console.log("Issue #67 洗替（ローカル）: %s の NormSource（未施行・解析済み）%d 件を再解析します。\n", criteria, toProcess.length);
  if (limit) console.log("--limit %d のため、先頭 %d 件のみ処理します。\n", limit, toProcess.length);

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
      writeProgress({ criteria, processed: skip + i, total: sources.length, lastUpdated: "" });
      console.error("\n\nAI レポートを生成できません（API キー未設定または失敗）。打ち切り。");
      console.error("続きから: npx tsx scripts/reanalyze-risk-local.ts --from-date %s --resume", fromDateStr);
      process.exit(1);
    }
    if (!result.ok) {
      console.error("エラー:", result.error);
      continue;
    }
    done += result.created;
    const processed = skip + i + 1;
    writeProgress({ criteria, processed, total: sources.length, lastUpdated: "" });
    console.log("ok (created %d)", result.created);
  }

  clearProgress();
  console.log("\n完了: %d 件再解析、NormChange %d 件作成。", toProcess.length, done);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Issue #52: cron 実行ログを表示するスクリプト
 *
 * 使い方: npx tsx scripts/view-cron-logs.ts [limit]
 * 例: npx tsx scripts/view-cron-logs.ts 10
 *
 * モード:
 * - SITE_URL と CRON_SECRET が設定されている場合: 本番 API (/api/ingest/cron-logs) 経由で取得
 * - それ以外: ローカル DB (DATABASE_URL) から直接取得
 */
import "dotenv/config";

const BASE_URL = process.env.SITE_URL?.trim() || "https://norm-changes.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET?.trim();

type LogEntry = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  result: string;
  processedDates: string[];
  processedCount: number;
  errorMessage: string | null;
  durationMs: number | null;
};

async function fetchFromApi(limit: number): Promise<LogEntry[]> {
  if (!CRON_SECRET) {
    throw new Error("CRON_SECRET が未設定です。.env に設定するか、ローカル DB モード（SITE_URL 未設定）で実行してください。");
  }
  const res = await fetch(`${BASE_URL}/api/ingest/cron-logs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API エラー ${res.status}: ${body}`);
  }
  const json = await res.json();
  return json.logs ?? [];
}

async function fetchFromDb(limit: number): Promise<LogEntry[]> {
  const { prisma } = await import("../src/lib/prisma");
  const logs = await prisma.cronExecutionLog.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return logs.map((l) => ({
    id: l.id,
    startedAt: l.startedAt.toISOString(),
    endedAt: l.endedAt?.toISOString() ?? null,
    result: l.result,
    processedDates: l.processedDates as string[],
    processedCount: (l.processedDates as string[]).length,
    errorMessage: l.errorMessage,
    durationMs: l.durationMs,
  }));
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  const limit = parseInt(process.argv[2] ?? "20", 10) || 20;
  const siteUrl = process.env.SITE_URL?.trim();
  const useApi = !!siteUrl && !!CRON_SECRET;

  console.log("=== cron 実行ログ ===\n");
  console.log(`モード: ${useApi ? `API (${BASE_URL})` : "ローカル DB"}`);
  console.log(`表示件数: ${limit}\n`);

  (useApi ? fetchFromApi(limit) : fetchFromDb(limit))
    .then((logs) => {
      if (logs.length === 0) {
        console.log("ログがありません。");
        return;
      }
      for (const l of logs) {
        const resultBadge = l.result === "ok" ? "✓" : l.result === "aborted" ? "!" : "✗";
        const duration = formatDuration(l.durationMs);
        console.log(`${l.startedAt} ${resultBadge} ${l.result} (${duration})`);
        console.log(`  処理日数: ${l.processedCount}日 ${l.processedDates.length > 0 ? `[${l.processedDates.join(", ")}]` : ""}`);
        if (l.errorMessage) {
          console.log(`  エラー: ${l.errorMessage}`);
        }
        console.log("");
      }
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}

main();

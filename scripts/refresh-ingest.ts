/**
 * データ洗い替え: 指定した日付範囲で ingest を順次実行する
 * 改正前全文（rawTextPrev）の取得は e-Gov API v2 を都度叩くため、1日あたり数分かかることがあります。
 *
 * 使い方:
 *   npx tsx scripts/refresh-ingest.ts [from_yyyyMMdd] [to_yyyyMMdd]
 * 例:
 *   npx tsx scripts/refresh-ingest.ts 20250101 20250216
 *   npx tsx scripts/refresh-ingest.ts 20250201  (from のみ → その日のみ)
 *
 * 前提: .env に DATABASE_URL が設定されていること
 */
import "dotenv/config";
import { runIngestForDate } from "../src/lib/ingest-laws";
import { setLastSuccessfulIngestDate } from "../src/lib/ingest-state";
import { runAnalyzeForPendingSources } from "../src/lib/run-analyze";

/** yyyyMMdd の日付リストを生成（from ≦ to） */
function dateRange(from: string, to: string): string[] {
  const list: string[] = [];
  const fromDate = parseYyyyMMdd(from);
  const toDate = parseYyyyMMdd(to);
  if (!fromDate || !toDate || fromDate > toDate) return list;
  const cur = new Date(fromDate);
  const end = toDate.getTime();
  while (cur.getTime() <= end) {
    list.push(formatYyyyMMdd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return list;
}

function parseYyyyMMdd(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(4, 6), 10) - 1;
  const d = parseInt(s.slice(6, 8), 10);
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

function formatYyyyMMdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function main() {
  const args = process.argv.slice(2);
  const from = args[0];
  const to = args[1] ?? from;
  if (!from || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) {
    console.error("使い方: npx tsx scripts/refresh-ingest.ts from_yyyyMMdd [to_yyyyMMdd]");
    process.exit(1);
  }

  const dates = dateRange(from, to);
  if (dates.length === 0) {
    console.error("無効な日付範囲です: from=%s to=%s", from, to);
    process.exit(1);
  }

  console.log("データ洗い替えを開始します（%d 日分）。改正前全文の取得のため、時間がかかります。\n", dates.length);
  const startTime = Date.now();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalLaws = 0;
  let failed = 0;

  // 改正前全文取得で e-Gov に負荷をかけないよう 1 件あたり 500ms 待機
  const delayAfterPrevMs = 500;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    process.stdout.write(`[${i + 1}/${dates.length}] ${date} ... `);
    const result = await runIngestForDate(date, { delayAfterPrevMs });
    if (result.ok) {
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalLaws += result.total;
      console.log("ok (total=%d created=%d updated=%d)", result.total, result.created, result.updated);
    } else {
      failed += 1;
      console.log("失敗: %s", result.error);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n完了: %d 日処理, 法令 %d 件 (新規 %d / 更新 %d), 失敗 %d 日, 所要時間 %s 秒", dates.length, totalLaws, totalCreated, totalUpdated, failed, elapsed);

  // NormChange がまだない NormSource を解析し、一覧に表示されるようにする
  if (totalLaws > 0) {
    console.log("\n未解析の NormSource を解析しています...");
    const analyzeResult = await runAnalyzeForPendingSources({});
    if (analyzeResult.ok) {
      console.log("解析完了: NormChange %d 件作成", analyzeResult.created);
    } else {
      console.warn("解析でエラー:", analyzeResult.error);
    }
  }

  // 次回 cron が「続きから」取り込めるよう、最後に処理した日を記録する
  if (dates.length > 0) {
    const lastDate = dates[dates.length - 1];
    await setLastSuccessfulIngestDate(lastDate);
    console.log("IngestState を %s まで取り込み済みに更新しました。", lastDate);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

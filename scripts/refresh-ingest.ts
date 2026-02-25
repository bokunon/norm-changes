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
import { runAnalyzeForPendingSources, isAnalyzeAborted } from "../src/lib/run-analyze";

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

/** Issue #40: 次回実行予定日（明日）を JST で「○月○日」形式で返す */
function getNextRunDateMessage(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const s = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(tomorrow);
  return s;
}

function logAbortedAndExit(): never {
  const nextRun = getNextRunDateMessage();
  console.error("\nAI レポート作れなかったからもう辞める。次は %s から実行よろしく。", nextRun);
  process.exit(1);
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
  /** Issue #40: AI レポートが作れず打ち切った場合は true。finally でログを残して exit(1) */
  let analyzeAborted = false;

  // 改正前全文取得で e-Gov に負荷をかけないよう 1 件あたり 500ms 待機
  const delayAfterPrevMs = 500;

  /** Issue #50: ingest と analyze の両方が成功した日のみ記録。analyze 失敗時は次回その日から再開 */
  let lastCompletedDate: string | null = null;

  try {
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      process.stdout.write(`[${i + 1}/${dates.length}] ${date} ... `);
      const result = await runIngestForDate(date, { delayAfterPrevMs });
      if (!result.ok) {
        failed += 1;
        console.log("失敗: %s", result.error);
        continue;
      }
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalLaws += result.total;
      console.log("ok (total=%d created=%d updated=%d)", result.total, result.created, result.updated);

      // Issue #50: その日の NormSource のみ解析（bulkdownloadDate でスコープ）
      const analyzeResult = await runAnalyzeForPendingSources({ bulkdownloadDate: date });
      if (isAnalyzeAborted(analyzeResult)) {
        analyzeAborted = true;
        break;
      }
      if (!analyzeResult.ok) {
        console.warn(" → 解析エラー:", analyzeResult.error, "（次回この日から再開）");
        break;
      }
      if (analyzeResult.created > 0) {
        console.log(" → 解析: NormChange %d 件", analyzeResult.created);
      } else {
        const parts: string[] = [];
        if (analyzeResult.skippedEffectivePast !== undefined && analyzeResult.skippedEffectivePast > 0) {
          parts.push(`施行日過去でスキップ ${analyzeResult.skippedEffectivePast} 件`);
        }
        if (analyzeResult.alreadyAnalyzed !== undefined && analyzeResult.alreadyAnalyzed > 0) {
          parts.push(`既に解析済み ${analyzeResult.alreadyAnalyzed} 件`);
        }
        const suffix = parts.length > 0 ? `（${parts.join("、")}）` : "";
        console.log(" → 解析: 0 件%s", suffix);
      }

      // ingest と analyze の両方成功時のみ記録
      await setLastSuccessfulIngestDate(date);
      lastCompletedDate = date;
    }
  } finally {
    if (analyzeAborted) {
      logAbortedAndExit();
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n完了: %d 日処理, 法令 %d 件 (新規 %d / 更新 %d), 失敗 %d 日, 所要時間 %s 秒", dates.length, totalLaws, totalCreated, totalUpdated, failed, elapsed);

    // bulkdownloadDate が null の既存データ等、残りの未解析を解析
    console.log("\n未解析の NormSource（bulkdownloadDate 未設定等）を解析しています...");
    const analyzeResult = await runAnalyzeForPendingSources({});
    if (isAnalyzeAborted(analyzeResult)) {
      logAbortedAndExit();
    }
    if (analyzeResult.ok) {
      if (analyzeResult.created > 0) {
        console.log("解析完了: NormChange %d 件作成", analyzeResult.created);
      } else {
        const parts: string[] = [];
        if (analyzeResult.skippedEffectivePast !== undefined && analyzeResult.skippedEffectivePast > 0) {
          parts.push(`施行日過去でスキップ ${analyzeResult.skippedEffectivePast} 件`);
        }
        if (analyzeResult.alreadyAnalyzed !== undefined && analyzeResult.alreadyAnalyzed > 0) {
          parts.push(`既に解析済み ${analyzeResult.alreadyAnalyzed} 件`);
        }
        const suffix = parts.length > 0 ? `、${parts.join("、")}` : "";
        console.log("解析完了: 未解析の NormSource はありませんでした（0 件%s）", suffix);
      }
    } else {
      console.warn("解析でエラー:", analyzeResult.error);
    }
  }

  if (lastCompletedDate) {
    console.log("IngestState を %s まで（ingest と analyze 両方完了）に更新しました。", lastCompletedDate);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

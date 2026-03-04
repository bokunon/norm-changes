/**
 * cron を叩き続け、一覧に新しい NormChange が出るまで繰り返す
 * 空レスポンスの日は自動でスキップして進める
 * 使い方: npx tsx scripts/run-cron-until-new.ts
 */
import "dotenv/config";
import { getLastSuccessfulIngestDate, setLastSuccessfulIngestDate } from "../src/lib/ingest-state";

const BASE_URL = process.env.SITE_URL?.trim() || "https://norm-changes.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET?.trim();

async function getLatestNormChangeId(): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/norm-changes?limit=1`);
  const json = await res.json();
  if (!json.ok || !json.items?.length) return null;
  return json.items[0].id;
}

async function invokeCron(): Promise<{
  ok: boolean;
  processed?: { date: string }[];
  analyzeCreated?: number;
  error?: string;
  failedDate?: string;
}> {
  if (!CRON_SECRET) {
    return { ok: false, error: "CRON_SECRET が未設定" };
  }
  const res = await fetch(`${BASE_URL}/api/ingest/cron`, {
    method: "GET",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const json = await res.json().catch(() => ({}));
  const processed = json.processed ?? [];
  const analyzeCreated = json.analyze?.created ?? 0;

  if (res.ok && json.ok) {
    return { ok: true, processed, analyzeCreated };
  }
  return {
    ok: false,
    error: json.error || `HTTP ${res.status}`,
    processed,
    analyzeCreated,
    failedDate: json.failedDate,
  };
}

async function main() {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET が .env に設定されていません");
    process.exit(1);
  }

  const initialLatestId = await getLatestNormChangeId();
  console.log("開始時点の一覧トップ ID:", initialLatestId ?? "(なし)");
  console.log("cron を繰り返し実行します（空レスポンスの日は自動スキップ）...\n");

  let round = 0;
  while (true) {
    round++;
    process.stdout.write(`[${round}] cron 実行中... `);
    const start = Date.now();
    const result = await invokeCron();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (result.ok) {
      const n = result.processed?.length ?? 0;
      console.log(`ok (${n} 日処理, analyze: ${result.analyzeCreated ?? 0} 件, ${elapsed}s)`);
    } else {
      const n = result.processed?.length ?? 0;
      console.log(`終了 (${elapsed}s)`);
      if (n > 0) {
        console.log(`  → 処理済み: ${n} 日`);
      }
      if (result.failedDate && result.error?.includes("レスポンスが空")) {
        await setLastSuccessfulIngestDate(result.failedDate);
        console.log(`  → 空レスポンスのため ${result.failedDate} をスキップして次回続行`);
      } else if (result.error) {
        console.log(`  → ${result.error}`);
      }
    }

    if (result.analyzeCreated && result.analyzeCreated > 0) {
      console.log("\n一覧に新しい NormChange が追加されました！(analyze: %d 件)", result.analyzeCreated);
      break;
    }

    const latestId = await getLatestNormChangeId();
    if (latestId && latestId !== initialLatestId) {
      console.log("\n一覧に新しい NormChange が追加されました！");
      console.log("最新 ID:", latestId);
      break;
    }

    if (!result.ok && (result.processed ?? []).length === 0 && !result.failedDate) {
      const last = await getLastSuccessfulIngestDate();
      if (last) {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const y = yesterday.getUTCFullYear();
        const m = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
        const d = String(yesterday.getUTCDate()).padStart(2, "0");
        const yesterdayStr = `${y}${m}${d}`;
        if (last >= yesterdayStr) {
          console.log("\n取り込み対象日がなく、前日まで済みです。");
          break;
        }
      }
      if (!result.error?.includes("レスポンスが空")) {
        console.log("\n取り込み対象日がなく、新規も出ませんでした。");
        break;
      }
    }

    if (round >= 200) {
      console.log("\n200 回実行しました。打ち切り。");
      break;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch(console.error);

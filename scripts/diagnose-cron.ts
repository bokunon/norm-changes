/**
 * cron が実行されていない原因を調査するスクリプト
 *
 * 使い方: npx tsx scripts/diagnose-cron.ts
 * 前提: .env に CRON_SECRET が設定されていること（本番と同じ値）
 *
 * 確認項目:
 * 1. 本番の /api/ingest/cron が CRON_SECRET で叩けるか
 * 2. 本番の /api/ingest/state で lastSuccessfulDate を確認
 * 3. CRON_SECRET 未設定時の挙動（500 になる）
 */
import "dotenv/config";

const BASE_URL = process.env.SITE_URL?.trim() || "https://norm-changes.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET?.trim();

async function main() {
  console.log("=== cron 実行状況の診断 ===\n");
  console.log("対象 URL:", BASE_URL);
  console.log("CRON_SECRET:", CRON_SECRET ? "設定あり" : "未設定");
  if (!CRON_SECRET) {
    console.error("\n.env に CRON_SECRET を設定してください（本番と同じ値）");
    process.exit(1);
  }

  // 1. CRON_SECRET なしで叩く → 500 または 401 が返る想定
  console.log("\n1. CRON_SECRET なしで /api/ingest/cron を叩く");
  const resNoAuth = await fetch(`${BASE_URL}/api/ingest/cron`);
  const jsonNoAuth = await resNoAuth.json().catch(() => ({}));
  console.log(`   HTTP ${resNoAuth.status}:`, jsonNoAuth.error || jsonNoAuth);
  if (resNoAuth.status === 500 && jsonNoAuth.error?.includes("CRON_SECRET")) {
    console.log("   → 本番の Vercel 環境変数に CRON_SECRET が設定されていない可能性");
  }

  // 2. CRON_SECRET ありで /api/ingest/state を叩く
  console.log("\n2. CRON_SECRET ありで /api/ingest/state を叩く（IngestState 確認）");
  const resState = await fetch(`${BASE_URL}/api/ingest/state`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const state = await resState.json().catch(() => ({}));
  if (resState.ok && !state.error) {
    console.log("   lastSuccessfulDate:", state.lastSuccessfulDate ?? "null");
    console.log("   normSourceCount:", state.normSourceCount);
    console.log("   publishedAtMax:", state.publishedAtMax ?? "null");

    const last = state.lastSuccessfulDate;
    const yesterday = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    })();
    if (last && last >= yesterday) {
      console.log("   → lastSuccess が昨日以降: cron は動いているか、取り込み対象日なしの可能性");
    } else if (last) {
      console.log(`   → lastSuccess (${last}) < 昨日 (${yesterday}): cron が動いていないか、取り込みで失敗している可能性`);
    } else {
      console.log("   → lastSuccess が null: 初回または IngestState 未設定");
    }
  } else {
    console.log("   HTTP", resState.status, state.error || state);
    if (resState.status === 401) {
      console.log("   → CRON_SECRET が本番と一致していない可能性");
    }
  }

  // 3. CRON_SECRET ありで /api/ingest/cron を叩く（手動実行）
  console.log("\n3. CRON_SECRET ありで /api/ingest/cron を叩く（手動実行テスト）");
  const resCron = await fetch(`${BASE_URL}/api/ingest/cron`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const cronResult = await resCron.json().catch(() => ({}));
  console.log("   HTTP", resCron.status);
  if (resCron.ok && cronResult.ok) {
    console.log("   processed:", cronResult.processed?.length ?? 0, "日");
    console.log("   lastSuccessfulDate:", cronResult.lastSuccessfulDate);
    console.log("   → 手動実行は成功。Vercel Cron が呼んでいない可能性");
  } else {
    console.log("   error:", cronResult.error || cronResult);
  }

  console.log("\n=== 追加確認（Vercel Dashboard） ===");
  console.log("4. Vercel Dashboard → プロジェクト → Cron Jobs タブ");
  console.log("   - Cron Jobs が有効か確認");
  console.log("   - View Logs で実行履歴を確認（リダイレクト/キャッシュ時はログに出ない場合あり）");
  console.log("5. Vercel Dashboard → Settings → Environment Variables");
  console.log("   - CRON_SECRET が Production に設定されているか確認");
  console.log("\n=== 診断完了 ===");
}

main().catch(console.error);

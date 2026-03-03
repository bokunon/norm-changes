/**
 * Issue #35–37: 1件だけ NormChange を再解析し、詳細画面で結果を確認できるようにする。
 * 使い方: npm run dev を起動した状態で npx tsx scripts/refresh-one-report.ts
 */
const SITE_BASE = process.env.SITE_URL ?? "http://localhost:3000";

async function main() {
  const listRes = await fetch(`${SITE_BASE}/api/norm-changes?limit=1`);
  const list = (await listRes.json()) as { ok: boolean; items?: { normSource?: { id: string } }[] };
  if (!list.ok || !list.items?.length || !list.items[0].normSource?.id) {
    console.error("NormChange が1件もありません。先に ingest や analyze でデータを作成してください。");
    process.exit(1);
  }
  const normSourceId = list.items[0].normSource.id;
  const analyzeRes = await fetch(
    `${SITE_BASE}/api/analyze?normSourceId=${encodeURIComponent(normSourceId)}&replace=1`,
    { method: "POST" }
  );
  const analyze = (await analyzeRes.json()) as { ok: boolean; ids?: string[]; error?: string };
  if (!analyze.ok || !analyze.ids?.length) {
    console.error("再解析に失敗しました:", analyze.error ?? "unknown");
    process.exit(1);
  }
  const detailId = analyze.ids[0];
  console.log("1件の再解析が完了しました。");
  console.log("詳細画面:", `${SITE_BASE}/norm-changes/${detailId}`);
}

main();

/**
 * 指定 normSourceId の 1 件だけ再解析する（replace=1）
 * 使い方: npx tsx scripts/analyze-one.ts <normSourceId>
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// 実行時の cwd に依存せず、プロジェクトルートの .env を確実に読み込む（import より先に実行する必要がある）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  const normSourceId = process.argv[2];
  if (!normSourceId) {
    console.error("使い方: npx tsx scripts/analyze-one.ts <normSourceId>");
    process.exit(1);
  }

  // dotenv 読み込み後に run-analyze を読み込む（process.env が確定してから）
  const { runAnalyzeForPendingSources, isAnalyzeAborted } = await import("../src/lib/run-analyze");

  const result = await runAnalyzeForPendingSources({ normSourceId, replace: true });
  if (isAnalyzeAborted(result)) {
    console.error("AI レポートを生成できません（API キー未設定または失敗）。", result.reason);
    process.exit(1);
  }
  if (!result.ok) {
    console.error("再解析エラー:", result.error);
    process.exit(1);
  }
  console.log("再解析完了: NormChange %d 件 (ids: %s)", result.created, result.ids?.join(", ") ?? "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

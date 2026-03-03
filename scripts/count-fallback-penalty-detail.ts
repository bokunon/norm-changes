/**
 * フォールバックテンプレートの penaltyDetail を持つ NormChange の件数を集計
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const FALLBACK_TEMPLATES = [
  "条文に業務停止・免許取消・登録取消等の規定があり、事業継続リスクに該当する。",
  "条文に罰金・課徴金・過料・納付金・科料等の規定があり、金銭リスクに該当する。",
  "条文に社名公表・勧告・警告等の規定があり、信用リスクに該当する。",
] as const;

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const counts = await Promise.all(
    FALLBACK_TEMPLATES.map((t) => prisma.normChange.count({ where: { penaltyDetail: t } }))
  );
  const total = counts.reduce((a, b) => a + b, 0);

  console.log("フォールバックテンプレート（penaltyDetail）該当件数:");
  console.log("  survival: ", counts[0]);
  console.log("  financial:", counts[1]);
  console.log("  credit:   ", counts[2]);
  console.log("  合計:     ", total);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

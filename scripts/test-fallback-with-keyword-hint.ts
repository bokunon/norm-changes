/**
 * Issue #73 試験: フォールバック時にキーワードをインプットに追加して AI で再判定
 *
 * 対象: penaltyDetail がフォールバックテンプレート（固定文言）の NormChange = キーワードフォールバックで拾われたデータ
 *
 * 使い方:
 *   npx tsx scripts/test-fallback-with-keyword-hint.ts --limit 5
 *   npx tsx scripts/test-fallback-with-keyword-hint.ts --limit 10 --output docs/issue-73-fallback-test-results.md
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

/** テンプレートかどうか */
function isTemplate(s: string | null): boolean {
  return s != null && (FALLBACK_TEMPLATES as readonly string[]).includes(s);
}

/** penaltyDetail が「具体的」か簡易判定（テンプレートより良いか） */
function isMoreSpecificThanTemplate(detail: string | null): boolean {
  if (!detail || detail.length < 20) return false;
  if (isTemplate(detail)) return false;
  // 条文参照（第〇条）、具体的な文言が含まれると良い
  const hasArticleRef = /第[一二三四五六七八九十百千〇\d]+条/.test(detail);
  const hasConcrete = /罰金|取消|停止|勧告|課徴金|過料|登録|免許|許可/.test(detail);
  const notGeneric = !detail.startsWith("条文に") || detail.length > 60;
  return (hasArticleRef || hasConcrete) && notGeneric;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? args[args.indexOf("--limit") + 1];
  const limit = limitArg ? parseInt(limitArg, 10) : 10;
  const outputArg = args.find((a) => a.startsWith("--output="))?.split("=")[1] ?? args[args.indexOf("--output") + 1];
  const outputPath = outputArg ?? null;

  const { prisma } = await import("../src/lib/prisma");
  const { generateReportWithKeywordHint } = await import("../src/lib/report-ai");
  const { findAllKeywordsInText, detectRiskByKeywords } = await import("../src/lib/risk-keyword-fallback");
  const fs = await import("fs");

  // 対象: penaltyDetail がフォールバックテンプレート（固定文言）の NormChange = キーワードフォールバックで拾われたデータ
  // survival（登録取消等）→ financial（罰金等）→ credit の順でサンプル（罰則文脈のケースを多く含める）
  const [survivalCases, financialCases, creditCases] = await Promise.all([
    prisma.normChange.findMany({
      where: { penaltyDetail: FALLBACK_TEMPLATES[0], normSource: { rawText: { not: null } } },
      include: { normSource: true },
      take: Math.ceil(limit / 3),
    }),
    prisma.normChange.findMany({
      where: { penaltyDetail: FALLBACK_TEMPLATES[1], normSource: { rawText: { not: null } } },
      include: { normSource: true },
      take: Math.ceil(limit / 3),
    }),
    prisma.normChange.findMany({
      where: { penaltyDetail: FALLBACK_TEMPLATES[2], normSource: { rawText: { not: null } } },
      include: { normSource: true },
      take: Math.ceil(limit / 3),
    }),
  ]);
  const fallbackCases = [...survivalCases, ...financialCases, ...creditCases].slice(0, limit);

  if (fallbackCases.length === 0) {
    console.log("フォールバック該当件数が 0 です。");
    return;
  }

  console.log("=== キーワードヒント付き AI 再判定 試験 (Issue #73) ===\n");
  console.log(`対象: ${fallbackCases.length} 件\n`);

  let improved = 0;
  let same = 0;
  let worse = 0;
  let aiReturnedOther = 0;

  /** 結果を保存用に集積（--output 指定時） */
  const results: Array<{
    title: string;
    normChangeId: string;
    keywords: string[];
    fallbackRisk: string;
    fallbackPenaltyDetail: string;
    aiRisk: string | null;
    aiPenaltyDetail: string | null;
    verdict: string;
  }> = [];

  for (const c of fallbackCases) {
    const src = c.normSource;
    if (!src?.rawText) {
      console.log(`[SKIP] ${src?.title?.slice(0, 40)}… rawText なし`);
      continue;
    }

    const keywords = findAllKeywordsInText(src.rawText);
    const keywordRisk = detectRiskByKeywords(src.rawText);
    const templateDetail = c.penaltyDetail;

    const input = {
      title: src.title,
      type: src.type,
      publishedAt: src.publishedAt.toISOString().slice(0, 10),
      effectiveAt: src.effectiveAt?.toISOString().slice(0, 10) ?? null,
      rawText: src.rawText,
      rawTextPrev: src.rawTextPrev,
    };

    const report = await generateReportWithKeywordHint(input, keywords);
    const aiRisk = report?.primaryRiskType ?? null;
    const aiDetail = report?.penaltyDetailText ?? null;

    const titleShort = src.title.slice(0, 45) + (src.title.length > 45 ? "…" : "");
    console.log(`--- ${titleShort} ---`);
    console.log(`  キーワード: ${keywords.join(", ") || "なし"}`);
    console.log(`  フォールバック: ${keywordRisk} | ${templateDetail?.slice(0, 50)}…`);
    console.log(`  AI再判定:      ${aiRisk ?? "null"} | ${aiDetail ? aiDetail.slice(0, 60) + (aiDetail.length > 60 ? "…" : "") : "null"}`);

    let verdict: string;
    if (aiRisk === "other" || !aiRisk) {
      aiReturnedOther++;
      verdict = "AI は other を返した（ヒントでも生存/金銭/信用にしなかった）";
      console.log(`  → ${verdict}`);
    } else if (aiDetail && isMoreSpecificThanTemplate(aiDetail)) {
      improved++;
      verdict = "改善: AI の penaltyDetail が具体的";
      console.log(`  → ${verdict}`);
    } else if (aiDetail && !isTemplate(aiDetail)) {
      same++;
      verdict = "同程度: AI も penaltyDetail を返した";
      console.log(`  → ${verdict}`);
    } else {
      worse++;
      verdict = "テンプレートと同様または null";
      console.log(`  → ${verdict}`);
    }

    results.push({
      title: src.title,
      normChangeId: c.id,
      keywords,
      fallbackRisk: keywordRisk ?? "—",
      fallbackPenaltyDetail: templateDetail ?? "",
      aiRisk: aiRisk ?? null,
      aiPenaltyDetail: aiDetail ?? null,
      verdict,
    });
    console.log("");
  }

  if (outputPath && results.length > 0) {
    const md = [
      "# Issue #73: キーワードヒント付き AI 再判定 試験結果",
      "",
      `実行日時: ${new Date().toISOString()}`,
      `対象件数: ${results.length}`,
      "",
      "## 対象データ",
      "",
      "`penaltyDetail` がフォールバックテンプレート（固定文言）の NormChange = キーワードフォールバックで拾われたデータ",
      "",
      "## 結果一覧",
      "",
      "| 法令 | キーワード | フォールバック種別 | フォールバック penaltyDetail | AI再判定種別 | AI再判定 penaltyDetail | 判定 |",
      "|------|-----------|-------------------|------------------------------|-------------|------------------------|------|",
      ...results.map((r) => {
        const esc = (s: string) => s.replace(/\|/g, "｜").replace(/\n/g, " ");
        return `| ${esc(r.title).slice(0, 40)}… | ${r.keywords.join(", ")} | ${r.fallbackRisk} | ${esc(r.fallbackPenaltyDetail ?? "").slice(0, 40)}… | ${r.aiRisk ?? "—"} | ${esc(r.aiPenaltyDetail ?? "").slice(0, 50)}… | ${esc(r.verdict)} |`;
      }),
      "",
      "## 詳細（penaltyDetail 全文）",
      "",
      ...results.flatMap((r, i) => [
        `### ${i + 1}. ${r.title}`,
        "",
        `- **NormChange ID**: \`${r.normChangeId}\``,
        `- **キーワード**: ${r.keywords.join(", ") || "なし"}`,
        `- **フォールバック種別**: ${r.fallbackRisk}`,
        `- **フォールバック penaltyDetail**: ${r.fallbackPenaltyDetail || "—"}`,
        `- **AI再判定種別**: ${r.aiRisk ?? "—"}`,
        `- **AI再判定 penaltyDetail**: ${r.aiPenaltyDetail ?? "—"}`,
        `- **判定**: ${r.verdict}`,
        "",
      ]),
    ].join("\n");
    fs.writeFileSync(outputPath, md, "utf-8");
    console.log(`\n結果を保存: ${outputPath}`);
  }

  console.log("=== サマリ ===");
  console.log(`改善（具体的な penaltyDetail）: ${improved}`);
  console.log(`同程度: ${same}`);
  console.log(`テンプレート相当 or null: ${worse}`);
  console.log(`AI が other を返した: ${aiReturnedOther}`);
  const total = improved + same + worse + aiReturnedOther;
  if (total > 0) {
    console.log(`\n改善率: ${((improved / total) * 100).toFixed(1)}%`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

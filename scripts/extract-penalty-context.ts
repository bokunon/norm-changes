/**
 * キーワード周辺の条文抜粋を抽出するロジックの検証
 * フォールバック時に penaltyDetail として使えるか試す
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const SURVIVAL_KEYWORDS = [
  "業務停止", "業務の停止", "免許取消", "免許の取消", "登録取消", "登録の取消",
  "許可取消", "許可の取消", "営業停止", "営業の停止", "事業停止", "事業の停止", "指定取消",
];
const FINANCIAL_KEYWORDS = ["罰金", "課徴金", "過料", "納付金", "科料"];
const CREDIT_KEYWORDS = ["社名公表", "氏名公表", "勧告", "警告", "指名"];

const ALL_KEYWORDS = [...SURVIVAL_KEYWORDS, ...FINANCIAL_KEYWORDS, ...CREDIT_KEYWORDS];

function findFirstKeyword(text: string): { keyword: string; index: number } | null {
  let earliest: { keyword: string; index: number } | null = null;
  for (const k of ALL_KEYWORDS) {
    const idx = text.indexOf(k);
    if (idx !== -1 && (earliest === null || idx < earliest.index)) {
      earliest = { keyword: k, index: idx };
    }
  }
  return earliest;
}

/**
 * キーワードを含む文・段落を抽出。最大 maxChars 文字。
 */
function extractContextAroundKeyword(text: string, maxChars = 200): string | null {
  const found = findFirstKeyword(text);
  if (!found) return null;

  const { keyword, index } = found;
  const before = text.slice(0, index);
  const after = text.slice(index + keyword.length);

  // 文の境界: 。または改行。前は直近の境界から、後は次の境界まで
  const sentenceEndBefore = /[。\n]([^。\n]*)$/;
  const sentenceStartAfter = /^([^。\n]*)[。\n]/;

  let start = Math.max(0, index - 100);
  const beforeMatch = before.slice(start).match(sentenceEndBefore);
  if (beforeMatch) start = index - beforeMatch[1].length;

  let end = Math.min(text.length, index + keyword.length + 100);
  const afterSlice = text.slice(index + keyword.length, end + 50);
  const afterMatch = afterSlice.match(sentenceStartAfter);
  if (afterMatch) end = index + keyword.length + afterMatch[1].length;

  let excerpt = text.slice(start, end).replace(/\n+/g, " ").trim();
  if (excerpt.length > maxChars) {
    excerpt = excerpt.slice(0, maxChars - 1) + "…";
  }
  return excerpt || null;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const fallback = await prisma.normChange.findMany({
    where: {
      penaltyDetail: {
        in: [
          "条文に業務停止・免許取消・登録取消等の規定があり、事業継続リスクに該当する。",
          "条文に罰金・課徴金・過料・納付金・科料等の規定があり、金銭リスクに該当する。",
          "条文に社名公表・勧告・警告等の規定があり、信用リスクに該当する。",
        ],
      },
    },
    include: { normSource: true },
    take: 10,
  });

  console.log("サンプル 10 件: 条文抜粋 vs 現行テンプレート\n");
  for (const c of fallback) {
    const raw = c.normSource?.rawText ?? "";
    const excerpt = extractContextAroundKeyword(raw);
    const risk = c.riskSurvival ? "survival" : c.riskFinancial ? "financial" : "credit";
    console.log(`--- ${c.normSource?.title?.slice(0, 40)}… (${risk}) ---`);
    console.log("現行:", c.penaltyDetail?.slice(0, 60) + "…");
    console.log("抜粋:", excerpt ?? "（抽出不可）");
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

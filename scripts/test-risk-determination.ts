/**
 * Issue #67: リスク判定の改善実験スクリプト
 *
 * サンプル法令に対して複数の判定戦略を試し、正しく判定できるか検証する。
 *
 * 使い方:
 *   npx tsx scripts/test-risk-determination.ts
 *   npx tsx scripts/test-risk-determination.ts --strategy keyword
 *   npx tsx scripts/test-risk-determination.ts --strategy ai-second
 *   npx tsx scripts/test-risk-determination.ts --limit 3
 *
 * 前提: .env に OPENAI_API_KEY, DATABASE_URL
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generateReport } from "../src/lib/report-ai";
import type { ReportInput, ReportOutput } from "../src/lib/report-ai";
import { detectRiskByKeywords } from "../src/lib/risk-keyword-fallback";
import type { RiskType } from "../src/lib/risk-keyword-fallback";
import OpenAI from "openai";

/** 戦略A: 現状の generateReport そのまま */
async function strategyBaseline(input: ReportInput): Promise<ReportOutput | null> {
  return generateReport(input);
}

/** 戦略B: AI が other を返したとき、キーワードで上書き */
async function strategyKeywordFallback(input: ReportInput): Promise<ReportOutput | null> {
  const report = await generateReport(input);
  if (!report) return null;
  if (report.primaryRiskType !== "other") return report;

  const detected = detectRiskByKeywords(input.rawText);
  if (detected) {
    return {
      ...report,
      primaryRiskType: detected,
    };
  }
  return report;
}

/** 戦略C: AI が other のとき、専用の簡潔な AI 呼び出しで再判定 */
async function strategyAiSecondCall(input: ReportInput): Promise<ReportOutput | null> {
  const report = await generateReport(input);
  if (!report) return null;
  if (report.primaryRiskType !== "other") return report;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return report;

  const text = (input.rawText ?? input.title).slice(0, 3000);
  const openai = new OpenAI({ apiKey });

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "法令条文を読み、企業リスクを判定する専門家。JSON のみで答える。",
        },
        {
          role: "user",
          content: `以下の条文に、次のいずれかが**規定として存在する**か判定してください。
- 業務停止・免許取消・登録取消・許可取消・営業停止 → survival
- 罰金・課徴金・過料・納付金・科料 → financial
- 社名公表・勧告・警告 → credit

該当する規定が条文に存在する場合、最も厳しい種別を選ぶ（survival > financial > credit）。
該当しない場合は other。

【条文】
${text}

答える形式: {"primaryRiskType": "survival" | "financial" | "credit" | "other"} のみ`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) return report;

    const parsed = JSON.parse(raw) as { primaryRiskType?: string };
    const pt = parsed.primaryRiskType;
    if (pt && ["survival", "financial", "credit"].includes(pt)) {
      return { ...report, primaryRiskType: pt as RiskType };
    }
  } catch (e) {
    console.error("[test-risk] AI second call failed:", e);
  }
  return report;
}

const STRATEGIES = {
  baseline: strategyBaseline,
  keyword: strategyKeywordFallback,
  "ai-second": strategyAiSecondCall,
} as const;

// 検証用サンプル（法令名の一部。DB から検索する）
const SAMPLE_TITLES = [
  "風俗営業等の規制及び業務の適正化等に関する法律",
  "公益通報者保護法",
  "不当景品類及び不当表示防止法",
  "物資の流通の効率化に関する法律",
  "貨物自動車運送事業法",
  "特定商取引に関する法律",
  "金融商品取引法",
  "私的独占の禁止及び公正取引の確保に関する法律",
];

// 各サンプルの期待リスク種別（調査結果に基づく。複数該当時は厳しい方）
const EXPECTED_RISK: Record<string, RiskType> = {
  風俗営業: "survival", // 許可取消・罰金3億円 → 生存が厳しい
  公益通報: "financial", // 罰則
  不当景品: "financial", // 課徴金、罰金
  物資の流通: "financial", // CLO 罰金・過料
  貨物自動車: "survival", // 事業停止・登録取消
  特定商取引: "survival", // 業務停止
  金融商品: "financial", // 課徴金
  私的独占: "financial", // 課徴金
};

function getExpectedRisk(title: string): RiskType | null {
  for (const [key, risk] of Object.entries(EXPECTED_RISK)) {
    if (title.includes(key)) return risk;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const strategyArg = args.find((a) => a.startsWith("--strategy="))?.split("=")[1] ?? args[args.indexOf("--strategy") + 1];
  const strategyName = (strategyArg ?? "keyword") as keyof typeof STRATEGIES;
  const strategy = STRATEGIES[strategyName] ?? strategyKeywordFallback;

  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? args[args.indexOf("--limit") + 1];
  const limit = limitArg ? parseInt(limitArg, 10) : 8;

  const verbose = args.includes("--verbose") || args.includes("-v");

  console.log("=== リスク判定 実験スクリプト (Issue #67) ===\n");
  console.log(`戦略: ${strategyName}`);
  console.log(`サンプル数: 最大 ${limit} 件\n`);

  // DB からサンプル取得。本則（施行令・施行規則・政令を除く）を優先
  const sources = await prisma.normSource.findMany({
    where: {
      OR: SAMPLE_TITLES.map((t) => ({ title: { contains: t.slice(0, 15) } })),
      rawText: { not: null }, // 本文がないとキーワード検出できない
    },
    orderBy: { publishedAt: "desc" },
    take: limit * 4,
  });

  // 本則を優先: 施行令・施行規則・政令・省令・府令・命令を含まないものを先に
  const byBase = (title: string) => {
    if (/施行令|施行規則|政令|省令|府令|命令|添付書類|定義に関する/.test(title)) return 1;
    return 0;
  };
  const sorted = [...sources].sort((a, b) => byBase(a.title) - byBase(b.title));

  // タイトルで重複除去（各法令の本則を優先）
  const seen = new Set<string>();
  const unique = sorted.filter((s) => {
    const key = SAMPLE_TITLES.find((t) => s.title.includes(t.slice(0, 10))) ?? s.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const toProcess = unique.slice(0, limit);

  if (toProcess.length === 0) {
    console.log("サンプルが見つかりません。DB に該当する NormSource があるか確認してください。");
    return;
  }

  let ok = 0;
  let ng = 0;

  for (const src of toProcess) {
    const input: ReportInput = {
      title: src.title,
      type: src.type,
      publishedAt: src.publishedAt.toISOString().slice(0, 10),
      effectiveAt: src.effectiveAt?.toISOString().slice(0, 10) ?? null,
      rawText: src.rawText,
      rawTextPrev: src.rawTextPrev,
    };

    const expected = getExpectedRisk(src.title);
    process.stdout.write(`${src.title.slice(0, 50)}... `);

    try {
      const report = await strategy(input);
      const result = report?.primaryRiskType ?? "null";

      if (expected) {
        const match = result === expected;
        if (match) {
          console.log(`✓ ${result} (期待: ${expected})`);
          ok++;
        } else {
          console.log(`✗ ${result} (期待: ${expected})`);
          ng++;
        }
      } else {
        console.log(`? ${result} (期待値未定義)`);
      }
    } catch (e) {
      console.log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
      ng++;
    }
  }

  const expectedCount = toProcess.filter((s) => getExpectedRisk(s.title)).length;
  console.log(`\n--- 結果 ---`);
  console.log(`OK: ${ok}, NG: ${ng}`);
  if (expectedCount > 0) {
    console.log(`正解率: ${((ok / expectedCount) * 100).toFixed(1)}% (期待値定義あり ${expectedCount} 件中)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

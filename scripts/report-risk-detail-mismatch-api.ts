/**
 * Issue #72: API 経由で「リスク種別あり & penaltyDetail なし」の全件調査
 *
 * DATABASE_URL がなくても、本番 API から取得してレポートする。
 * 各件の rawText は個別 GET で取得し、キーワード検出・文脈判定を行う。
 */
const BASE = "https://norm-changes.vercel.app";

async function fetchAllMismatches(): Promise<
  Array<{ id: string; title: string; actualRisk: string; penaltyDetail: string | null }>
> {
  const mismatches: Array<{ id: string; title: string; actualRisk: string; penaltyDetail: string | null }> = [];
  let cursor: string | undefined;

  do {
    const url = new URL("/api/norm-changes", BASE);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (!data.ok || !data.items) break;

    for (const item of data.items) {
      const hasSevereRisk = item.riskSurvival || item.riskFinancial || item.riskCredit;
      if (hasSevereRisk && !item.penaltyDetail) {
        const actualRisk = item.riskSurvival ? "survival" : item.riskFinancial ? "financial" : "credit";
        mismatches.push({
          id: item.id,
          title: item.normSource?.title ?? "—",
          actualRisk,
          penaltyDetail: item.penaltyDetail,
        });
      }
    }
    cursor = data.nextCursor;
  } while (cursor);

  return mismatches;
}

async function fetchDetail(id: string): Promise<{ rawText: string } | null> {
  const res = await fetch(`${BASE}/api/norm-changes/${id}`);
  const data = await res.json();
  if (!data.ok || !data.item?.normSource?.rawText) return null;
  return { rawText: data.item.normSource.rawText };
}

const SURVIVAL_KEYWORDS = ["業務停止", "免許取消", "登録取消", "登録の取消", "許可取消", "営業停止", "事業停止", "指定取消"];
const FINANCIAL_KEYWORDS = ["罰金", "課徴金", "過料", "納付金", "科料"];
const CREDIT_KEYWORDS = ["社名公表", "氏名公表", "勧告", "警告", "指名"];

function detectKeyword(text: string): { keyword: string; type: string } | null {
  for (const k of SURVIVAL_KEYWORDS) if (text.includes(k)) return { keyword: k, type: "survival" };
  for (const k of FINANCIAL_KEYWORDS) if (text.includes(k)) return { keyword: k, type: "financial" };
  for (const k of CREDIT_KEYWORDS) if (text.includes(k)) return { keyword: k, type: "credit" };
  return null;
}

function isPenaltyContext(text: string, keyword: string, window = 80): boolean {
  const idx = text.indexOf(keyword);
  if (idx === -1) return false;
  const around = text.slice(Math.max(0, idx - window), idx + keyword.length + window);
  const markers = ["罰則", "違反", "科する", "処分", "懲戒", "取消", "停止", "百万円", "万円", "過料", "課徴金", "罰金"];
  return markers.some((m) => around.includes(m));
}

function isProceduralNofukin(text: string): boolean {
  const idx = text.indexOf("納付金");
  if (idx === -1) return false;
  const around = text.slice(Math.max(0, idx - 60), idx + 80);
  return around.includes("負担金") || around.includes("清算金") || around.includes("納付期限") || around.includes("納付の");
}

async function main() {
  console.log("\n========== 調査対象: API から取得 ==========\n");

  const mismatches = await fetchAllMismatches();
  console.log(`条件: (riskSurvival OR riskFinancial OR riskCredit) = true かつ penaltyDetail = null`);
  console.log(`該当件数: ${mismatches.length} 件\n`);

  if (mismatches.length === 0) {
    console.log("該当なし。");
    return;
  }

  const rows: Array<{
    id: string;
    title: string;
    actualRisk: string;
    keywordFound: string | null;
    keywordType: string | null;
    fallbackApplied: boolean;
    penaltyContext: boolean | null;
    correctRisk: string;
    verdict: string;
  }> = [];

  for (const m of mismatches) {
    const detail = await fetchDetail(m.id);
    const rawText = detail?.rawText ?? "";

    const keywordDetail = detectKeyword(rawText);
    const fallbackApplied = keywordDetail !== null && keywordDetail.type === m.actualRisk;

    let penaltyContext: boolean | null = null;
    if (keywordDetail) {
      if (keywordDetail.keyword === "納付金") {
        penaltyContext = !isProceduralNofukin(rawText);
      } else {
        penaltyContext = isPenaltyContext(rawText, keywordDetail.keyword);
      }
    }

    let correctRisk: string;
    let verdict: string;

    if (fallbackApplied) {
      if (penaltyContext === true) {
        correctRisk = m.actualRisk;
        verdict = "フォールバック正: キーワードが罰則文脈。penaltyDetail を生成すべき";
      } else if (penaltyContext === false) {
        correctRisk = "other";
        verdict = "フォールバック誤: キーワードは手続き規定等の文脈。other が正しい";
      } else {
        correctRisk = m.actualRisk;
        verdict = "フォールバック要検証: キーワードあり。文脈確認が必要";
      }
    } else {
      if (keywordDetail !== null && keywordDetail.type !== m.actualRisk) {
        correctRisk = keywordDetail.type;
        verdict = "AI とフォールバック不一致: キーワードは " + keywordDetail.type + " を指す";
      } else if (keywordDetail === null) {
        correctRisk = m.actualRisk;
        verdict = "AI 由来: キーワードなし。AI が survival/financial/credit を返したが penaltyDetail を忘れた";
      } else {
        correctRisk = m.actualRisk;
        verdict = "要確認";
      }
    }

    rows.push({
      id: m.id,
      title: m.title,
      actualRisk: m.actualRisk,
      keywordFound: keywordDetail?.keyword ?? null,
      keywordType: keywordDetail?.type ?? null,
      fallbackApplied,
      penaltyContext,
      correctRisk,
      verdict,
    });
  }

  console.log("| ID | 法令 | 実際のリスク | キーワード | フォールバック適用 | 罰則文脈 | あるべきリスク | 判定 |");
  console.log("|----|------|-------------|-----------|-------------------|---------|---------------|------|");
  for (const r of rows) {
    const idShort = r.id.slice(-8);
    const titleShort = r.title.length > 25 ? r.title.slice(0, 22) + "…" : r.title;
    console.log(
      `| ${idShort} | ${titleShort} | ${r.actualRisk} | ${r.keywordFound ?? "—"} | ${r.fallbackApplied ? "○" : "—"} | ${r.penaltyContext === null ? "—" : r.penaltyContext ? "○" : "×"} | ${r.correctRisk} | ${r.verdict} |`
    );
  }

  console.log("\n\n========== サマリ ==========\n");

  const fallbackCorrect = rows.filter(
    (r) => r.verdict.startsWith("フォールバック正") || r.verdict.startsWith("フォールバック要検証")
  ).length;
  const fallbackWrong = rows.filter((r) => r.verdict.startsWith("フォールバック誤")).length;
  const aiOrigin = rows.filter((r) => r.verdict.startsWith("AI 由来")).length;
  const other = rows.filter((r) => !r.verdict.startsWith("フォールバック") && !r.verdict.startsWith("AI 由来")).length;

  console.log(`フォールバック正（penaltyDetail 生成すべき）: ${fallbackCorrect} 件`);
  console.log(`フォールバック誤（other が正しい）: ${fallbackWrong} 件`);
  console.log(`AI 由来（キーワードなし、AI の penaltyDetail 漏れ）: ${aiOrigin} 件`);
  console.log(`その他: ${other} 件`);

  console.log("\n【方針の根拠】");
  if (fallbackCorrect > 0) {
    console.log(`- ${fallbackCorrect} 件はフォールバックが正しく判定。→ フォールバック維持 + penaltyDetail 生成が必要`);
  }
  if (fallbackWrong > 0) {
    console.log(`- ${fallbackWrong} 件はフォールバックが過検出。→ 文脈チェック強化 or フォールバック条件厳格化`);
  }
  if (aiOrigin > 0) {
    console.log(`- ${aiOrigin} 件は AI がリスク種別を返したが penaltyDetail を返さなかった。→ プロンプト改善が必要`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

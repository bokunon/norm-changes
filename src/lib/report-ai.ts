/**
 * Issue #12: 法令本文を元に企業向けレポート（何をすべきか）を OpenAI で生成する
 * 入力: rawText + rawTextPrev（あれば）+ 法令メタ
 * 出力: サマリ・箇条書きアクション・詳細推奨アクション＋根拠（構造化 JSON）
 */
import OpenAI from "openai";
import { stripObligationAndLevelFromSummary } from "@/lib/risk-display";

export interface ReportInput {
  title: string;
  type: string;
  publishedAt: string;
  effectiveAt: string | null;
  rawText: string | null;
  rawTextPrev: string | null;
}

/** Issue #37: 推奨アクションの出典（元法 vs 改正） */
export type RecommendationSource = "amendment" | "existing";

/** 取るべきアクション（ポイント）1件。source で「今回の改正で変わったか」を明示 */
export type ActionItemWithSource = { text: string; source?: RecommendationSource };

export interface ReportOutput {
  summary: string;
  /** 取るべきアクションのポイント。各要素に source を付与すると「今回の改正で変わった」が明示される */
  actionItems: ActionItemWithSource[];
  detailedRecommendations: {
    action: string;
    basis: string;
    source?: RecommendationSource;
  }[];
  /** Issue #36: 改正後に発生した罰則・義務リスクについての解釈を断定で1文 */
  penaltyDetailText?: string | null;
  /**
   * 当該改正で最も厳しいリスクを1つだけ。
   * 複数該当しうる場合でも、厳しさの順（survival > financial > credit > other）で1つに決める。
   */
  primaryRiskType?: "survival" | "financial" | "credit" | "other";
}

const SYSTEM_PROMPT = `あなたは法令・省令・政令の改正内容を読み、企業が取るべき対応を整理するアシスタントです。
出力は必ず指定の JSON 形式のみで返してください。説明文は不要です。

JSON の形式:
{
  "summary": "1〜3文で、この改正の要点と企業が把握すべきことを要約。**「対応重要度」や MUST/SHOULD/INFO の表記は一切含めない。概要の内容のみを書く。**",
  "actionItems": [
    { "text": "ポイント1の文言", "source": "amendment" または "existing" },
    ...
  ],
  "detailedRecommendations": [
    { "action": "具体的な推奨アクションの文言", "basis": "根拠（条文・箇所など）", "source": "amendment" または "existing" },
    ...
  ],
  "primaryRiskType": "survival" | "financial" | "credit" | "other",
  "penaltyDetailText": "primaryRiskType の判定根拠（1文）。survival/financial/credit のときは必ず記載。other のときは null"
}

- **primaryRiskType と penaltyDetailText は同一の推論で一貫して返す**（Issue #71）。リスク判定とその根拠を同時に出力する。
- primaryRiskType: **改正により新たに発生したリスクのみ**を評価する。必ず4つのいずれか1つだけを返す。
  - 改正前の条文に既にあった規定は含めない。
  - **改正前の全文が無い場合**（新規制定・前版取得不可等）は、改正後の全文に記載されている罰則・義務リスクを**すべて新規として評価する**。
  - 次のいずれかに該当する場合に、該当するリスクを選ぶ:
    (1) 改正で新たに追加された規定（登録取消し、業務停止、罰金等）
    (2) 既存規定の適用条件が変わって実質的にリスクが生じた場合（例: 届出が任意→必須になり、既存の罰則が実効化）
    (3) 罰則の強化（罰金額の引き上げ、適用範囲の拡大等）
    (4) 規定の明確化（曖昧だった規定が具体化され、実効性が高まった場合）
  - survival: 上記(1)(2)(3)(4)で業務停止・免許取消・登録取消等（事業が続けられなくなる可能性）が該当する場合。
  - financial: 上記(1)(2)(3)(4)で罰金・課徴金・過料・納付金・科料等の金銭的負担が該当する場合。
  - credit: 上記(1)(2)(3)(4)で社名公表・勧告・警告等（信用・評判に関わる措置）が該当する場合。
  - other: 手続きの方法変更・届出様式変更・記載の整理等、上記3つに当てはまらないが対応が必要な改正。文言の微修正のみの場合も other。
  厳しさの順は survival > financial > credit > other。複数該当しうる場合は厳しい方1つだけ返す。
- actionItems: 取るべきアクションの「ポイントのみ」を3〜10個。各要素は { "text": "文言", "source": "amendment" または "existing" }。source は「今回の改正で新たに必要になった」なら amendment、「元の法律からある対応」なら existing。必ず付与する。
- detailedRecommendations: 「具体的な」推奨アクションと根拠。各要素に source を付与: "amendment"=改正により発生した内容, "existing"=元の法律にあった内容。
- penaltyDetailText: **primaryRiskType が survival/financial/credit のときは必ず記載**。その判定の根拠（なぜそのリスクと判断したか、条文のどの規定に基づくか）を解釈の断定文で1文で記載。primaryRiskType が other のときは null。**程度（HIGH/MID/LOW/NONE）や義務レベル（MUST/SHOULD/INFO）の表記は一切入れず、解釈の断定文のみを記載する。**`;

function buildUserPrompt(input: ReportInput): string {
  const parts: string[] = [
    `# 法令情報`,
    `タイトル: ${input.title}`,
    `種別: ${input.type}`,
    `公示日: ${input.publishedAt}`,
    `施行日: ${input.effectiveAt ?? "（未定）"}`,
    "",
  ];

  if (input.rawTextPrev && input.rawTextPrev.trim()) {
    parts.push("# 改正前の全文（抜粋: 先頭4000文字）");
    parts.push(input.rawTextPrev.slice(0, 4000) + (input.rawTextPrev.length > 4000 ? "…" : ""));
    parts.push("");
  }

  parts.push("# 改正後の全文（抜粋: 先頭8000文字）");
  const text = input.rawText ?? input.title;
  parts.push(text.slice(0, 8000) + (text.length > 8000 ? "…" : ""));

  return parts.join("\n");
}

/** レポート生成・リスク検証に使用。5 系の方が指示遵守が良い。nano はより安価・低レイテンシ用 */
const MODEL = "gpt-5-mini";

/**
 * OpenAI でレポートを生成する。API Key 未設定やエラー時は null を返す。
 * primaryRiskType が survival / financial / credit のときは検証を行い、
 * 条文に該当する規定が無ければ other に上書きする。other は検証しない。
 */
export async function generateReport(input: ReportInput): Promise<ReportOutput | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const openai = new OpenAI({ apiKey });
  const userContent = buildUserPrompt(input);

  try {
    // gpt-5-mini でレポート生成（指示遵守を優先）。コスト優先なら gpt-5-nano に変更可
    // モデルによっては temperature はデフォルト(1)のみサポート。0.3 を指定すると 400 になるため省略
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const actionItems: ActionItemWithSource[] = Array.isArray(parsed.actionItems)
      ? (parsed.actionItems as (string | { text?: string; source?: string })[])
          .filter((x) => x != null)
          .map((x): ActionItemWithSource => {
            if (typeof x === "string") return { text: x, source: undefined };
            const text = typeof x?.text === "string" ? x.text : "";
            const source: RecommendationSource | undefined =
              x?.source === "amendment" || x?.source === "existing"
                ? (x.source as RecommendationSource)
                : undefined;
            return { text, source };
          })
          .filter((a) => a.text.trim() !== "")
      : [];
    const detailedRecommendations: {
      action: string;
      basis: string;
      source?: RecommendationSource;
    }[] = Array.isArray(parsed.detailedRecommendations)
      ? (
          parsed.detailedRecommendations as {
            action?: string;
            basis?: string;
            source?: string;
          }[]
        )
          .filter((x) => x && typeof x.action === "string")
          .map((x) => ({
            action: String(x.action),
            basis: typeof x.basis === "string" ? x.basis : "",
            source:
              x.source === "amendment" || x.source === "existing"
                ? (x.source as RecommendationSource)
                : undefined,
          }))
      : [];

    const penaltyDetailText =
      parsed.penaltyDetailText === null || parsed.penaltyDetailText === undefined
        ? undefined
        : typeof parsed.penaltyDetailText === "string" && parsed.penaltyDetailText.trim() !== ""
          ? parsed.penaltyDetailText.trim()
          : null;

    let primaryRiskType = ["survival", "financial", "credit", "other"].includes(
      String(parsed.primaryRiskType)
    )
      ? (parsed.primaryRiskType as "survival" | "financial" | "credit" | "other")
      : undefined;

    // Issue #67: validateRiskTypeInText は廃止。偽陰性を招くため、AI の判定をそのまま採用する。

    // 対応重要度は表示しない方針のため、AI が含めていても除去してから返す
    const rawSummary = typeof parsed.summary === "string" ? parsed.summary : "";
    const summary = stripObligationAndLevelFromSummary(rawSummary) || rawSummary;
    return {
      summary,
      actionItems,
      detailedRecommendations,
      penaltyDetailText: penaltyDetailText ?? undefined,
      primaryRiskType,
    };
  } catch (err) {
    // API キーは読めているが呼び出し失敗時は原因をログに残す（読み取り側の問題かどうか切り分け用）
    console.error("[report-ai] generateReport 失敗:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Issue #73 試験用: キーワードヒントをインプットに追加して AI で再判定する。
 * フォールバックが生じた際に、検出したキーワードを渡して精度向上を試す。
 */
export async function generateReportWithKeywordHint(
  input: ReportInput,
  keywords: string[]
): Promise<ReportOutput | null> {
  if (keywords.length === 0) return generateReport(input);

  const basePrompt = buildUserPrompt(input);
  const hint = `\n\n【補足】条文に以下のキーワードが含まれています: ${keywords.join("、")}。この情報を踏まえて、primaryRiskType と penaltyDetailText を判定してください。罰則・制裁の文脈で使われているか、手続き規定等の文脈かを区別して判断してください。`;
  const userContent = basePrompt + hint;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const openai = new OpenAI({ apiKey });
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const actionItems: ActionItemWithSource[] = Array.isArray(parsed.actionItems)
      ? (parsed.actionItems as (string | { text?: string; source?: string })[])
          .filter((x) => x != null)
          .map((x): ActionItemWithSource => {
            if (typeof x === "string") return { text: x, source: undefined };
            const text = typeof x?.text === "string" ? x.text : "";
            const source: RecommendationSource | undefined =
              x?.source === "amendment" || x?.source === "existing"
                ? (x.source as RecommendationSource)
                : undefined;
            return { text, source };
          })
          .filter((a) => a.text.trim() !== "")
      : [];
    const detailedRecommendations: {
      action: string;
      basis: string;
      source?: RecommendationSource;
    }[] = Array.isArray(parsed.detailedRecommendations)
      ? (
          parsed.detailedRecommendations as {
            action?: string;
            basis?: string;
            source?: string;
          }[]
        )
          .filter((x) => x && typeof x.action === "string")
          .map((x) => ({
            action: String(x.action),
            basis: typeof x.basis === "string" ? x.basis : "",
            source:
              x.source === "amendment" || x.source === "existing"
                ? (x.source as RecommendationSource)
                : undefined,
          }))
      : [];

    const penaltyDetailText =
      parsed.penaltyDetailText === null || parsed.penaltyDetailText === undefined
        ? undefined
        : typeof parsed.penaltyDetailText === "string" && parsed.penaltyDetailText.trim() !== ""
          ? parsed.penaltyDetailText.trim()
          : null;

    const primaryRiskType = ["survival", "financial", "credit", "other"].includes(
      String(parsed.primaryRiskType)
    )
      ? (parsed.primaryRiskType as "survival" | "financial" | "credit" | "other")
      : undefined;

    const rawSummary = typeof parsed.summary === "string" ? parsed.summary : "";
    const summary = stripObligationAndLevelFromSummary(rawSummary) || rawSummary;
    return {
      summary,
      actionItems,
      detailedRecommendations,
      penaltyDetailText: penaltyDetailText ?? undefined,
      primaryRiskType,
    };
  } catch (err) {
    console.error(
      "[report-ai] generateReportWithKeywordHint 失敗:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Issue #12: 法令本文を元に企業向けレポート（何をすべきか）を OpenAI で生成する
 * 入力: rawText + rawTextPrev（あれば）+ 法令メタ
 * 出力: サマリ・箇条書きアクション・詳細推奨アクション＋根拠（構造化 JSON）
 */
import OpenAI from "openai";

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

export interface ReportOutput {
  summary: string;
  actionItems: string[];
  detailedRecommendations: {
    action: string;
    basis: string;
    source?: RecommendationSource;
  }[];
  riskLevel?: "HIGH" | "MID" | "LOW" | "NONE";
  obligationLevel?: "MUST" | "SHOULD" | "INFO";
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
  "summary": "1〜3文で、この改正の要点と企業が把握すべきことを要約",
  "actionItems": ["ポイント1", "ポイント2", ...],
  "detailedRecommendations": [
    { "action": "具体的な推奨アクションの文言", "basis": "根拠（条文・箇所など）", "source": "amendment" または "existing" },
    ...
  ],
  "riskLevel": "HIGH" | "MID" | "LOW" | "NONE",
  "obligationLevel": "MUST" | "SHOULD" | "INFO",
  "penaltyDetailText": "改正後に新たに発生した罰則・義務リスクについて、法律の前後から解釈した断定文（1文）。該当なしなら null",
  "primaryRiskType": "survival" | "financial" | "credit" | "other"
}

- riskLevel: 罰則・業務停止・登録取消等のリスクが高いほど HIGH。特になければ NONE。
- primaryRiskType: **この改正で当てはまる最も厳しいリスクを1つだけ**選び、このキーにその値のみを設定する。必ず4つのいずれか1つだけを返す。
  - survival: 条文に業務停止・免許取消・登録取消等（事業が続けられなくなる可能性）が明示または合理的に読み取れる場合。
  - financial: 条文に罰金・課徴金・過料・納付金・科料等の金銭的負担が明示または合理的に読み取れる場合。**手続き変更のみ・罰則的記載が一切ない場合は選ばない。**
  - credit: 条文に社名公表・勧告・警告等（信用・評判に関わる措置）が明示または合理的に読み取れる場合。
  - other: 手続きの方法変更・届出様式変更・記載の整理等、上記3つに当てはまらないが対応が必要な改正。**手続き変更のみの場合は other を選ぶ。**
  厳しさの順は survival > financial > credit > other。複数該当しうる場合は厳しい方1つだけ返す。
- obligationLevel: 義務規定（しなければならない等）が強ければ MUST。推奨程度なら SHOULD。参考情報なら INFO。
- actionItems: 取るべきアクションの「ポイントのみ」を3〜10個。短い見出し程度に。
- detailedRecommendations: 「具体的な」推奨アクションと根拠。各要素に source を付与: "amendment"=改正により発生した内容, "existing"=元の法律にあった内容。
- penaltyDetailText: 改正前にはなく改正後に発生している罰則・義務リスクに限定し、解釈を断定で1文で記載。該当しなければ null。`;

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

const MODEL = "gpt-4o-mini";

type RiskTypeToValidate = "survival" | "financial" | "credit";

const RISK_VALIDATION_SPEC: Record<
  RiskTypeToValidate,
  { key: string; question: string }
> = {
  survival: {
    key: "hasMatch",
    question: `以下の改正条文の内容に、**業務停止・免許取消・登録取消・許可取消・営業停止**等（事業が続けられなくなる可能性がある措置）が、条文上に明示的に規定されているか判定してください。
該当する文言が条文に存在する場合のみ true、それ以外は false。`,
  },
  financial: {
    key: "hasMatch",
    question: `以下の改正条文の内容に、**罰金・課徴金・過料・納付金・科料**のいずれかが、条文上に明示的に規定されているか判定してください。
該当する文言が条文に存在する場合のみ true、手続き規定・届出義務等のみで金銭罰の規定が無い場合は false。`,
  },
  credit: {
    key: "hasMatch",
    question: `以下の改正条文の内容に、**社名公表・氏名公表・勧告・警告・指名**等（信用・評判に関わる措置）が、条文上に明示的に規定されているか判定してください。
該当する文言が条文に存在する場合のみ true、それ以外は false。`,
  },
};

/**
 * 条文に指定リスク種別に該当する規定が明示されているかを検証する。
 * survival / financial / credit のいずれかが選ばれたとき、矛盾があれば other に上書きするために使う。
 */
async function validateRiskTypeInText(
  openai: OpenAI,
  rawText: string | null,
  riskType: RiskTypeToValidate
): Promise<boolean> {
  const text = (rawText ?? "").trim().slice(0, 4000);
  if (!text) return false;
  const spec = RISK_VALIDATION_SPEC[riskType];
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "あなたは法令の条文を読む専門家です。質問に JSON のみで答えてください。",
        },
        {
          role: "user",
          content: `${spec.question}

【条文】
${text}

答える形式: {"${spec.key}": true または false} のみ。`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed[spec.key] === true;
  } catch {
    return false;
  }
}

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
    // リスク判定の精度のため gpt-4o-mini を使用。必要に応じて gpt-4.1-nano 等に変更可
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const actionItems = Array.isArray(parsed.actionItems)
      ? (parsed.actionItems as string[]).filter((x) => typeof x === "string")
      : [];
    const detailedRecommendations = Array.isArray(parsed.detailedRecommendations)
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
              x.source === "amendment" || x.source === "existing" ? x.source : undefined,
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

    // survival / financial / credit のいずれかなら、条文に該当規定が明示されているか検証。無ければ other に上書き
    if (
      primaryRiskType === "survival" ||
      primaryRiskType === "financial" ||
      primaryRiskType === "credit"
    ) {
      const hasMatch = await validateRiskTypeInText(
        openai,
        input.rawText ?? "",
        primaryRiskType
      );
      if (!hasMatch) {
        primaryRiskType = "other";
      }
    }

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      actionItems,
      detailedRecommendations,
      riskLevel:
        parsed.riskLevel === "HIGH" || parsed.riskLevel === "MID" || parsed.riskLevel === "LOW" || parsed.riskLevel === "NONE"
          ? parsed.riskLevel
          : undefined,
      obligationLevel:
        parsed.obligationLevel === "MUST" || parsed.obligationLevel === "SHOULD" || parsed.obligationLevel === "INFO"
          ? parsed.obligationLevel
          : undefined,
      penaltyDetailText: penaltyDetailText ?? undefined,
      primaryRiskType,
    };
  } catch {
    return null;
  }
}

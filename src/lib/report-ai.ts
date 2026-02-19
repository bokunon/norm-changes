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

export interface ReportOutput {
  summary: string;
  actionItems: string[];
  detailedRecommendations: { action: string; basis: string }[];
  riskLevel?: "HIGH" | "MID" | "LOW" | "NONE";
  obligationLevel?: "MUST" | "SHOULD" | "INFO";
}

const SYSTEM_PROMPT = `あなたは法令・省令・政令の改正内容を読み、企業が取るべき対応を整理するアシスタントです。
出力は必ず指定の JSON 形式のみで返してください。説明文は不要です。

JSON の形式:
{
  "summary": "1〜3文で、この改正の要点と企業が把握すべきことを要約",
  "actionItems": ["箇条書きで企業が取るべきアクション1", "アクション2", ...],
  "detailedRecommendations": [
    { "action": "推奨アクションの文言", "basis": "根拠（条文・箇所など）" },
    ...
  ],
  "riskLevel": "HIGH" | "MID" | "LOW" | "NONE",
  "obligationLevel": "MUST" | "SHOULD" | "INFO"
}

- riskLevel: 罰則・業務停止・登録取消等のリスクが高いほど HIGH。特になければ NONE。
- obligationLevel: 義務規定（しなければならない等）が強ければ MUST。推奨程度なら SHOULD。参考情報なら INFO。
- actionItems は3〜10個程度。具体的で実行可能な文言に。
- detailedRecommendations は各アクションの根拠を条文や改正内容に基づいて簡潔に。`;

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

/**
 * OpenAI でレポートを生成する。API Key 未設定やエラー時は null を返す。
 */
export async function generateReport(input: ReportInput): Promise<ReportOutput | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  const openai = new OpenAI({ apiKey });
  const userContent = buildUserPrompt(input);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
      ? (parsed.detailedRecommendations as { action?: string; basis?: string }[])
          .filter((x) => x && typeof x.action === "string")
          .map((x) => ({ action: String(x.action), basis: typeof x.basis === "string" ? x.basis : "" }))
      : [];

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
    };
  } catch {
    return null;
  }
}

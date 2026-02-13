/**
 * Slack Incoming Webhook にメッセージを送信する
 * SLACK_WEBHOOK_URL が設定されている場合のみ送信
 */

export async function notifySlack(payload: {
  title: string;
  summary: string;
  type: string;
  publishedAt: string;
  effectiveAt?: string | null;
  url?: string | null;
  penaltyRisk: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || url === "") return { ok: true };

  const text = [
    `*${payload.title}*`,
    `種別: ${payload.type} | 公示日: ${payload.publishedAt}`,
    payload.effectiveAt ? `施行日: ${payload.effectiveAt}` : null,
    payload.penaltyRisk !== "NONE" ? `⚠️ 罰則リスク: ${payload.penaltyRisk}` : null,
    "",
    payload.summary.slice(0, 500) + (payload.summary.length > 500 ? "…" : ""),
    payload.url ? `<${payload.url}|法令本文>` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      return { ok: false, error: `Slack HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

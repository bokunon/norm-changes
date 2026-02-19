/**
 * Slack Incoming Webhook にメッセージを送信する
 * SLACK_WEBHOOK_URL が設定されている場合のみ送信
 * 本文はリスク詳細の文言のみ（サマリは出さない）
 */

export async function notifySlack(payload: {
  title: string;
  /** リスク詳細の断定文（例: 改正後、申請手続きに必要な書類を…）。無い場合は省略 */
  riskDetailText: string | null;
  detailPageUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url || url === "") return { ok: true };

  const text = [
    `*${payload.title}*`,
    payload.riskDetailText?.trim()
      ? payload.riskDetailText.trim().slice(0, 500) + (payload.riskDetailText.trim().length > 500 ? "…" : "")
      : null,
    "",
    `<${payload.detailPageUrl}|詳細ページを開く>`,
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

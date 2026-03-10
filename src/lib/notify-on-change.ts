/**
 * 新規 NormChange の通知フィルタマッチング・Slack 送信を担う
 */
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { matchesNotificationFilter } from "@/lib/notification-filter-match";
import type { NormChange, NormSource } from "@prisma/client";

export async function notifyOnChange(change: NormChange, src: NormSource): Promise<void> {
  const notificationFilters = await prisma.notificationFilter.findMany();
  if (notificationFilters.length === 0) return;

  const changeWithTags = await prisma.normChange.findUnique({
    where: { id: change.id },
    include: { tags: true },
  });
  const hasTagId = (tagId: string) =>
    (changeWithTags?.tags.some((t) => t.tagId === tagId) ?? false);
  const shouldNotify = notificationFilters.some((f) =>
    matchesNotificationFilter(change, src, f, f.tagId ? hasTagId(f.tagId) : true)
  );
  if (!shouldNotify) return;

  // Slack のリンク: SITE_URL 優先（本番URLを明示可能）。未設定なら VERCEL_URL（Vercel のみ）、最後に localhost
  const baseUrl =
    process.env.SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  await notifySlack({
    title: src.title,
    riskDetailText: change.penaltyDetail ?? null,
    detailPageUrl: `${baseUrl}/norm-changes/${change.id}`,
  });
}

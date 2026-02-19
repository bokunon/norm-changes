/**
 * Issue #30: 新規 NormChange が通知用フィルタに一致するか判定する
 */
import type { NormChange, NormSource, NotificationFilter } from "@prisma/client";

export function matchesNotificationFilter(
  change: Pick<NormChange, "riskSurvival" | "riskFinancial" | "riskCredit">,
  source: Pick<NormSource, "publishedAt" | "type">,
  filter: NotificationFilter,
  hasTagId: boolean
): boolean {
  if (filter.publishedFrom && source.publishedAt < filter.publishedFrom) return false;
  if (filter.publishedTo && source.publishedAt > filter.publishedTo) return false;
  if (filter.normType && source.type !== filter.normType) return false;
  // 新規作成時はタグが付いていないため、tagId 指定ありの場合は一致させない
  if (filter.tagId && !hasTagId) return false;

  // リスク条件: フィルタで指定したリスクの「いずれか1つでも」記事に付いていれば一致（OR）
  const riskMatch =
    (!filter.riskSurvival && !filter.riskFinancial && !filter.riskCredit) ||
    (filter.riskSurvival && change.riskSurvival) ||
    (filter.riskFinancial && change.riskFinancial) ||
    (filter.riskCredit && change.riskCredit);
  if (!riskMatch) return false;

  return true;
}

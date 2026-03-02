"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getNormTypeLabelJa } from "@/lib/norm-types";
import {
  getMostSevereRisk,
  stripRiskLevelFromPenaltyDetail,
  stripObligationAndLevelFromSummary,
} from "@/lib/risk-display";

type Detail = {
  id: string;
  summary: string;
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  riskOther: boolean;
  penaltyDetail: string | null;
  effectiveFrom: string | null;
  deadline: string | null;
  /** 後方互換: string[] または { text, source? }[] */
  reportActionItems: string[] | { text: string; source?: "amendment" | "existing" }[] | null;
  reportDetailedRecommendations: {
    action: string;
    basis: string;
    source?: "amendment" | "existing";
  }[] | null;
  normSource: {
    id: string;
    type: string;
    title: string;
    number: string | null;
    publisher: string | null;
    publishedAt: string;
    effectiveAt: string | null;
    url: string | null;
    rawText: string | null;
    rawTextPrev: string | null;
  } | null;
  tags: { id: string; key: string; labelJa: string; type: string }[];
};

export default function NormChangeDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [item, setItem] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/norm-changes/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setItem(data.item);
        else setItem(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ja-JP") : "—";

  if (loading) return <p className="p-6">読み込み中…</p>;
  if (!item)
    return (
      <div className="p-6">
        <p>該当する変更が見つかりません。</p>
        <Link href="/norm-changes" className="text-blue-600 underline mt-2 inline-block">
          一覧へ
        </Link>
      </div>
    );

  // AI レポート未生成ならこのプロダクトは意味をなさないため、転けて停止し次回を待つ
  const hasAiReport =
    (item.summary && item.summary.trim() !== "") ||
    (Array.isArray(item.reportActionItems) && item.reportActionItems.length > 0);
  if (!hasAiReport) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 flex flex-col items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
            AI レポートが未生成のため表示できません。
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            管理者に API キー設定と再解析を依頼し、次回のアクセスをお待ちください。
          </p>
          <Link
            href="/norm-changes"
            className="inline-block text-blue-600 dark:text-blue-400 underline mt-4"
          >
            一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-3xl mx-auto">
        <nav className="mb-6">
          <Link
            href="/norm-changes"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:underline"
          >
            ← 一覧へ
          </Link>
        </nav>
        <article className="border rounded-lg p-6 bg-white dark:bg-zinc-900 dark:border-zinc-700">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            {item.normSource?.title ?? "法令変更"}
          </h1>
          <dl className="grid gap-2 text-sm mb-6">
            <div>
              <dt className="text-zinc-500">種別</dt>
              <dd>{getNormTypeLabelJa(item.normSource?.type)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">法令番号</dt>
              <dd>{item.normSource?.number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">公示日</dt>
              <dd>{formatDate(item.normSource?.publishedAt ?? null)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">施行日</dt>
              <dd>{formatDate(item.normSource?.effectiveAt ?? null)}</dd>
            </div>
            {/* リスクの種類: 条文に罰則等が明示されている場合の分類。手続き変更のみは「その他」 */}
            <div>
              <dt className="text-zinc-500">リスクの種類</dt>
              <dd className="flex flex-wrap items-baseline gap-2 mt-1">
                {(() => {
                  const risk = getMostSevereRisk(item);
                  return risk ? (
                    <span className={risk.className}>{risk.label}</span>
                  ) : (
                    "—"
                  );
                })()}
              </dd>
            </div>
            {/* リスク詳細: リスクの種類の補足（解釈断定文）。survival/financial/credit のときのみ。other のみなら「なし」 */}
            <div>
              <dt className="text-zinc-500">リスク詳細</dt>
              <dd
                className={
                  item.riskFinancial
                    ? "text-red-600 dark:text-red-400"
                    : item.riskSurvival
                      ? "text-amber-600 dark:text-amber-400"
                      : item.riskCredit
                        ? "text-sky-600 dark:text-sky-400"
                        : undefined
                }
              >
                {item.penaltyDetail?.trim()
                  ? stripRiskLevelFromPenaltyDetail(item.penaltyDetail)
                  : "なし"}
              </dd>
            </div>
            {item.tags.length > 0 && (
              <div>
                <dt className="text-zinc-500">タグ</dt>
                <dd className="flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 text-xs"
                    >
                      {t.labelJa}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {/* Issue #12: AI レポート（サマリ・箇条書き・詳細＋根拠）を全文の上に表示。未生成の場合は上で転けて停止済み */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              概要
            </h2>
            <div className="space-y-4">
              {item.summary && item.summary.trim() !== "" && (
                <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                  {stripObligationAndLevelFromSummary(item.summary) || item.summary}
                </p>
              )}
              {/* Issue #37: 上＝取るべきアクション（ポイントのみ）、下＝推奨アクション（具体的）。元法 vs 改正を明示 */}
              {Array.isArray(item.reportActionItems) && item.reportActionItems.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                    取るべきアクション（ポイント）
                  </h3>
                  <ul className="list-disc list-inside space-y-1.5 text-zinc-800 dark:text-zinc-200 text-sm">
                    {item.reportActionItems.map((action, i) => {
                      const text =
                        typeof action === "string" ? action : action.text;
                      const source =
                        typeof action === "string" ? undefined : action.source;
                      return (
                        <li key={i} className="flex flex-wrap items-center gap-2">
                          {source === "amendment" && (
                            <span className="rounded bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-xs text-emerald-800 dark:text-emerald-200 shrink-0">
                              改正
                            </span>
                          )}
                          {source === "existing" && (
                            <span className="rounded bg-zinc-200 dark:bg-zinc-600 px-1.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 shrink-0">
                              元法
                            </span>
                          )}
                          <span>{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {Array.isArray(item.reportDetailedRecommendations) &&
                item.reportDetailedRecommendations.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                      推奨アクション（具体的）
                    </h3>
                    <ul className="space-y-3">
                      {item.reportDetailedRecommendations.map((rec, i) => (
                        <li
                          key={i}
                          className="border-l-2 border-zinc-200 dark:border-zinc-600 pl-3 text-sm"
                        >
                          <p className="text-zinc-800 dark:text-zinc-200 font-medium flex flex-wrap items-center gap-2">
                            {rec.source === "amendment" && (
                              <span className="rounded bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-xs text-emerald-800 dark:text-emerald-200 shrink-0">
                                改正
                              </span>
                            )}
                            {rec.source === "existing" && (
                              <span className="rounded bg-zinc-200 dark:bg-zinc-600 px-1.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 shrink-0">
                                元法
                              </span>
                            )}
                            <span>{rec.action}</span>
                          </p>
                          {rec.basis && (
                            <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">
                              根拠: {rec.basis}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </section>
          {item.normSource?.url && (
            <a
              href={item.normSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline text-sm block mb-6"
            >
              法令本文（e-Gov）を開く
            </a>
          )}
          {/* 改正後全文・改正前全文（#24, #25）。並べて比較できる想定。改正前は API 取得できた場合のみ表示 */}
          {(item.normSource?.rawText != null || item.normSource?.rawTextPrev != null) && (
            <section className="border-t border-zinc-200 dark:border-zinc-700 pt-6 mt-6">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                改正後・改正前の全文（並べて比較用）
              </h2>
              {item.normSource?.rawTextPrev == null ||
              item.normSource.rawTextPrev === "" ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                  改正前の全文は現時点で取得できていません。表示されているのは改正後（現行）のみです。前後比較するには e-Gov API v2（law_revisions / law_data）の仕様確認が必要です。
                </p>
              ) : null}
              <div className="grid gap-6">
                {item.normSource?.rawText != null && item.normSource.rawText !== "" && (
                  <div>
                    <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                      改正後（現行）全文
                    </h3>
                    <div className="rounded border border-zinc-200 dark:border-zinc-700 p-4 bg-zinc-50 dark:bg-zinc-800/50 max-h-80 overflow-y-auto">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                        {item.normSource.rawText}
                      </pre>
                    </div>
                  </div>
                )}
                {item.normSource?.rawTextPrev != null && item.normSource.rawTextPrev !== "" ? (
                  <div>
                    <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                      改正前全文
                    </h3>
                    <div className="rounded border border-zinc-200 dark:border-zinc-700 p-4 bg-zinc-50 dark:bg-zinc-800/50 max-h-80 overflow-y-auto">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                        {item.normSource.rawTextPrev}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                      改正前全文
                    </h3>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                      （未取得）
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}

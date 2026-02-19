"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getNormTypeLabelJa } from "@/lib/norm-types";

type Detail = {
  id: string;
  summary: string;
  obligationLevel: string;
  penaltyRisk: string;
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  penaltyDetail: string | null;
  effectiveFrom: string | null;
  deadline: string | null;
  reportSummary: string | null;
  reportActionItems: string[] | null;
  reportDetailedRecommendations: { action: string; basis: string }[] | null;
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
            <div>
              <dt className="text-zinc-500">対応重要度</dt>
              <dd>{item.obligationLevel}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">罰則リスク</dt>
              <dd
                className={
                  item.penaltyRisk === "HIGH"
                    ? "text-red-600 dark:text-red-400"
                    : undefined
                }
              >
                {item.penaltyRisk}
                {item.penaltyDetail ? ` — ${item.penaltyDetail}` : ""}
              </dd>
            </div>
            {(item.riskSurvival || item.riskFinancial || item.riskCredit) && (
              <div>
                <dt className="text-zinc-500">リスク（3軸）</dt>
                <dd className="flex flex-wrap gap-2 mt-1">
                  {item.riskSurvival && (
                    <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-2 py-1 text-sm text-amber-800 dark:text-amber-200">
                      生存リスク（業務停止・免許取消等）
                    </span>
                  )}
                  {item.riskFinancial && (
                    <span className="rounded bg-red-100 dark:bg-red-900/40 px-2 py-1 text-sm text-red-800 dark:text-red-200">
                      金銭リスク（罰金・課徴金等）
                    </span>
                  )}
                  {item.riskCredit && (
                    <span className="rounded bg-sky-100 dark:bg-sky-900/40 px-2 py-1 text-sm text-sky-800 dark:text-sky-200">
                      信用リスク（社名公表・勧告等）
                    </span>
                  )}
                </dd>
              </div>
            )}
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
          {/* Issue #12: AI レポート（サマリ・箇条書き・詳細＋根拠）を全文の上に表示 */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              概要・何をしないといけないか
            </h2>
            {item.reportSummary || (item.reportActionItems && item.reportActionItems.length > 0) ? (
              <div className="space-y-4">
                {item.reportSummary && (
                  <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                    {item.reportSummary}
                  </p>
                )}
                {item.reportActionItems && item.reportActionItems.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                      取るべきアクション（箇条書き）
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-zinc-800 dark:text-zinc-200 text-sm">
                      {item.reportActionItems.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.reportDetailedRecommendations &&
                  item.reportDetailedRecommendations.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                        詳細推奨アクションと根拠
                      </h3>
                      <ul className="space-y-3">
                        {item.reportDetailedRecommendations.map((rec, i) => (
                          <li
                            key={i}
                            className="border-l-2 border-zinc-200 dark:border-zinc-600 pl-3 text-sm"
                          >
                            <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                              {rec.action}
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
            ) : (
              <div className="space-y-2">
                <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                  {item.summary}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  （AI レポート未生成。.env に OPENAI_API_KEY を設定し、開発サーバーを再起動したうえで「再解析」すると、サマリ・箇条書き・詳細＋根拠が表示されます）
                </p>
              </div>
            )}
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

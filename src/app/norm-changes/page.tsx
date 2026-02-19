"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getNormTypeLabelJa } from "@/lib/norm-types";

type NormChangeItem = {
  id: string;
  summary: string;
  obligationLevel: string;
  penaltyRisk: string;
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  penaltyDetail: string | null;
  effectiveFrom: string | null;
  normSource: {
    id: string;
    type: string;
    title: string;
    number: string | null;
    publishedAt: string;
    effectiveAt: string | null;
    url: string | null;
  } | null;
  tags: { id: string; key: string; labelJa: string; type: string }[];
};

const RISK_LABELS: { key: "survival" | "financial" | "credit"; label: string }[] = [
  { key: "survival", label: "生存" },
  { key: "financial", label: "金銭" },
  { key: "credit", label: "信用" },
];

export default function NormChangesPage() {
  const [items, setItems] = useState<NormChangeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [riskFilter, setRiskFilter] = useState<("survival" | "financial" | "credit")[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from.replace(/-/g, ""));
    if (to) params.set("to", to.replace(/-/g, ""));
    if (riskFilter.length > 0) params.set("risk", riskFilter.join(","));
    // フィルタ変更時にローディング表示するため effect 内で true にしている
    queueMicrotask(() => setLoading(true));
    fetch(`/api/norm-changes?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setItems(data.items);
        else setItems([]);
      })
      .finally(() => setLoading(false));
  }, [from, to, riskFilter]);

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ja-JP") : "—";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Issue #13: DB接続確認・アーキテクチャ概要をサブとしてナビに配置 */}
        <nav className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <a
            href="/settings"
            className="text-zinc-600 dark:text-zinc-400 hover:underline"
          >
            設定（Slack 通知）
          </a>
          <span className="text-zinc-500 dark:text-zinc-400">サブ:</span>
          <a
            href="/api/db-health"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 dark:text-zinc-400 hover:underline"
          >
            DB 接続確認
          </a>
          <a
            href="https://github.com/bokunon/spec-driven-app/blob/main/docs/architecture.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 dark:text-zinc-400 hover:underline"
          >
            アーキテクチャ概要
          </a>
        </nav>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          法令インパクト一覧
        </h1>
        <div className="flex flex-wrap gap-4 mb-6">
          <label className="flex items-center gap-2 text-sm">
            公示日 From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border rounded px-2 py-1 dark:bg-zinc-800 dark:border-zinc-600"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            公示日 To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded px-2 py-1 dark:bg-zinc-800 dark:border-zinc-600"
            />
          </label>
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="sr-only">リスクで絞り込み</legend>
            {RISK_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={riskFilter.includes(key)}
                  onChange={(e) => {
                    setRiskFilter((prev) =>
                      e.target.checked ? [...prev, key] : prev.filter((r) => r !== key)
                    );
                  }}
                  className="rounded border-zinc-400"
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>
        {loading ? (
          <p className="text-zinc-500">読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="text-zinc-500">該当する変更はありません。</p>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li
                key={item.id}
                className="border rounded-lg p-4 bg-white dark:bg-zinc-900 dark:border-zinc-700"
              >
                <Link href={`/norm-changes/${item.id}`} className="block">
                  <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                    {item.normSource?.title ?? item.summary.slice(0, 60)}
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-2">
                    {item.summary}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="text-zinc-400">
                      リスク:{" "}
                      {(item.riskSurvival || item.riskFinancial || item.riskCredit) ? (
                        <span className="inline-flex flex-wrap gap-1">
                          {item.riskSurvival && (
                            <span className="rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-amber-800 dark:text-amber-200">
                              生存
                            </span>
                          )}
                          {item.riskFinancial && (
                            <span className="rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-red-800 dark:text-red-200">
                              金銭
                            </span>
                          )}
                          {item.riskCredit && (
                            <span className="rounded bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0.5 text-sky-800 dark:text-sky-200">
                              信用
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="text-zinc-400">
                      施行日: {formatDate(item.normSource?.effectiveAt ?? null)}
                    </span>
                    {item.normSource?.type && (
                      <span className="rounded bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {getNormTypeLabelJa(item.normSource.type)}
                      </span>
                    )}
                    <span className="text-zinc-400">
                      公示日: {formatDate(item.normSource?.publishedAt ?? null)}
                    </span>
                    {item.tags.length > 0 && (
                      <span className="text-zinc-400">
                        {item.tags.map((t) => t.labelJa).join(", ")}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

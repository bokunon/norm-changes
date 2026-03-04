"use client";

import { useEffect, useState } from "react";
import { getNormTypeLabelJa } from "@/lib/norm-types";
import { getMostSevereRiskShort, stripObligationAndLevelFromSummary } from "@/lib/risk-display";

type NormChangeItem = {
  id: string;
  summary: string;
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  riskOther: boolean;
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

/** Issue #75: 検索条件は括弧書きで補足 */
const RISK_LABELS: { key: "survival" | "financial" | "credit" | "other"; label: string }[] = [
  { key: "survival", label: "事業継続（免許取消・業務停止等）" },
  { key: "financial", label: "罰金等（罰金・課徴金・過料等）" },
  { key: "credit", label: "社名公表等（社名公表・勧告・警告等）" },
  { key: "other", label: "その他" },
];

/** effectiveAt から施行済か未施行かを判定 */
function isEnforced(effectiveAt: string | null): boolean {
  if (!effectiveAt) return false;
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return new Date(effectiveAt) <= todayStart;
}

type EnforcementFilter = "not_yet" | "enforced" | "all";

export default function NormChangesPage() {
  const [items, setItems] = useState<NormChangeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Issue #54: デフォルトは未施行・生存・金銭。Issue #75: 信用（社名公表等）も初期表示に含める
  const [enforcement, setEnforcement] = useState<EnforcementFilter>("not_yet");
  const [riskFilter, setRiskFilter] = useState<("survival" | "financial" | "credit" | "other")[]>([
    "survival",
    "financial",
    "credit",
  ]);

  const buildParams = () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from.replace(/-/g, ""));
    if (to) params.set("to", to.replace(/-/g, ""));
    if (enforcement !== "all") params.set("enforcement", enforcement);
    if (riskFilter.length > 0) params.set("risk", riskFilter.join(","));
    return params;
  };

  useEffect(() => {
    const params = buildParams();
    queueMicrotask(() => setLoading(true));
    setNextCursor(null);
    fetch(`/api/norm-changes?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.items)) {
          setItems(data.items);
          setNextCursor(data.nextCursor ?? null);
        } else {
          setItems([]);
          setNextCursor(null);
        }
      })
      .finally(() => setLoading(false));
  }, [from, to, enforcement, riskFilter]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    const params = buildParams();
    params.set("cursor", nextCursor);
    setLoadingMore(true);
    fetch(`/api/norm-changes?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.items)) {
          setItems((prev) => [...prev, ...data.items]);
          setNextCursor(data.nextCursor ?? null);
        }
      })
      .finally(() => setLoadingMore(false));
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ja-JP") : "—";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          法令変更・インパクト一覧
        </h1>
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Issue #53: 施行状態で絞り込み */}
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="sr-only">施行状態で絞り込み</legend>
            {(["not_yet", "enforced", "all"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="enforcement"
                  checked={enforcement === v}
                  onChange={() => setEnforcement(v)}
                  className="border-zinc-400"
                />
                {v === "not_yet" ? "未施行" : v === "enforced" ? "施行済" : "すべて"}
              </label>
            ))}
          </fieldset>
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
          <>
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="border rounded-lg p-4 bg-white dark:bg-zinc-900 dark:border-zinc-700"
                >
                  <div className="block">
                    <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                      {item.normSource?.title ?? (item.summary ?? "").slice(0, 60)}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-2">
                      {stripObligationAndLevelFromSummary(item.summary) || (item.summary ?? "")}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {/* Issue #53: 施行済・未施行のバッジ。Issue #77: 施行済はグレー（省令・政令と同じ表記） */}
                      <span
                        className={
                          isEnforced(item.normSource?.effectiveAt ?? null)
                            ? "rounded bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 font-medium text-zinc-700 dark:text-zinc-300"
                            : "rounded bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 font-medium text-emerald-800 dark:text-emerald-200"
                        }
                      >
                        {isEnforced(item.normSource?.effectiveAt ?? null) ? "施行済" : "未施行"}
                      </span>
                      <span className="text-zinc-400">
                        リスク:{" "}
                        {(() => {
                          const r = getMostSevereRiskShort(item);
                          return r ? (
                            <span className={r.className}>{r.label}</span>
                          ) : (
                            "—"
                          );
                        })()}
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
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <span className="text-zinc-400">
                          {item.tags.map((t) => t.labelJa).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {/* Issue #31: もっと見るで追加取得 */}
            {nextCursor && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                >
                  {loadingMore ? "読み込み中…" : "もっと見る"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

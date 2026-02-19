"use client";

/**
 * Issue #30: Slack 通知まわりの設定
 * - Slack の設定状態（Webhook 設定済みか）
 * - 通知用フィルタの一覧・追加・削除
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { NORM_TYPE_OPTIONS } from "@/lib/norm-types";

type SlackConfig = { ok: boolean; webhookConfigured: boolean };

type NotificationFilterItem = {
  id: string;
  name: string;
  publishedFrom: string | null;
  publishedTo: string | null;
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  riskOther: boolean;
  normType: string | null;
  tagId: string | null;
  createdAt: string;
  updatedAt: string;
};

const RISK_LABELS: { key: "survival" | "financial" | "credit" | "other"; label: string }[] = [
  { key: "survival", label: "生存" },
  { key: "financial", label: "金銭" },
  { key: "credit", label: "信用" },
  { key: "other", label: "その他" },
];

export default function SettingsPage() {
  const [slackConfig, setSlackConfig] = useState<SlackConfig | null>(null);
  const [filters, setFilters] = useState<NotificationFilterItem[]>([]);
  const [filtersLoadError, setFiltersLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新規フィルタフォーム
  const [name, setName] = useState("");
  const [publishedFrom, setPublishedFrom] = useState("");
  const [publishedTo, setPublishedTo] = useState("");
  const [riskSurvival, setRiskSurvival] = useState(false);
  const [riskFinancial, setRiskFinancial] = useState(false);
  const [riskCredit, setRiskCredit] = useState(false);
  const [riskOther, setRiskOther] = useState(false);
  const [normType, setNormType] = useState("");
  const [tagId, setTagId] = useState("");

  const loadSlackConfig = () =>
    fetch("/api/slack-config")
      .then((r) => r.text())
      .then((text) => {
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.ok) setSlackConfig(data);
        } catch {
          setSlackConfig({ ok: false, webhookConfigured: false });
        }
      })
      .catch(() => setSlackConfig({ ok: false, webhookConfigured: false }));

  const loadFilters = () =>
    fetch("/api/notification-filters")
      .then((r) => r.text())
      .then((text) => {
        setFiltersLoadError(null);
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.ok) {
            setFilters(data.items ?? []);
          } else {
            setFilters([]);
            if (data.error) setFiltersLoadError(data.error);
          }
        } catch {
          setFilters([]);
        }
      })
      .catch(() => {
        setFilters([]);
        setFiltersLoadError("一覧の取得に失敗しました");
      });

  useEffect(() => {
    setLoading(true);
    Promise.all([loadSlackConfig(), loadFilters()]).finally(() => setLoading(false));
  }, []);

  const handleAddFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("フィルタ名を入力してください");
      return;
    }
    setError(null);
    setSubmitting(true);
    fetch("/api/notification-filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        publishedFrom: publishedFrom || null,
        publishedTo: publishedTo || null,
        riskSurvival,
        riskFinancial,
        riskCredit,
        riskOther,
        normType: normType || null,
        tagId: tagId.trim() || null,
      }),
    })
      .then((r) => r.text())
      .then((text) => {
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.ok) {
            setName("");
            setPublishedFrom("");
            setPublishedTo("");
            setRiskSurvival(false);
            setRiskFinancial(false);
            setRiskCredit(false);
            setRiskOther(false);
            setNormType("");
            setTagId("");
            loadFilters();
          } else {
            setError(data.error ?? "追加に失敗しました");
          }
        } catch {
          setError("レスポンスの解析に失敗しました");
        }
      })
      .catch(() => setError("通信に失敗しました"))
      .finally(() => setSubmitting(false));
  };

  const handleDeleteFilter = (id: string) => {
    if (!confirm("この通知用フィルタを削除しますか？")) return;
    fetch(`/api/notification-filters/${id}`, { method: "DELETE" })
      .then((r) => r.text())
      .then((text) => {
        try {
          const data = text ? JSON.parse(text) : {};
          if (data.ok) loadFilters();
        } catch {
          loadFilters();
        }
      })
      .catch(() => {});
  };

  const formatCondition = (f: NotificationFilterItem): string => {
    const parts: string[] = [];
    if (f.publishedFrom) parts.push(`公示日 From: ${f.publishedFrom}`);
    if (f.publishedTo) parts.push(`To: ${f.publishedTo}`);
    const risks = [];
    if (f.riskSurvival) risks.push("生存");
    if (f.riskFinancial) risks.push("金銭");
    if (f.riskCredit) risks.push("信用");
    if (f.riskOther) risks.push("その他");
    if (risks.length) parts.push(`リスク: ${risks.join(", ")}`);
    if (f.normType) {
      const opt = NORM_TYPE_OPTIONS.find((o) => o.value === f.normType);
      parts.push(`種別: ${opt?.label ?? f.normType}`);
    }
    if (f.tagId) parts.push(`タグID: ${f.tagId}`);
    return parts.length ? parts.join(" / ") : "条件なし（すべて通知）";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-zinc-500">読み込み中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-2xl mx-auto">
        <nav className="mb-6 text-sm">
          <Link
            href="/norm-changes"
            className="text-zinc-600 dark:text-zinc-400 hover:underline"
          >
            ← 一覧へ
          </Link>
        </nav>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
          設定（Slack 通知）
        </h1>

        {/* Slack の設定状態 */}
        <section className="mb-8 p-4 rounded-lg bg-white dark:bg-zinc-900 dark:border dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
            Slack
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Webhook:{" "}
            {slackConfig?.webhookConfigured ? (
              <span className="text-green-600 dark:text-green-400">設定済み</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">未設定</span>
            )}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
            <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">SLACK_WEBHOOK_URL</code>{" "}
            を .env に設定すると、新規の変更点が通知用フィルタに一致したときだけ Slack に送信されます。
          </p>
        </section>

        {/* 通知用フィルタ */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
            通知用フィルタ
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            新規に作成された変更点が、いずれかのフィルタ条件に一致したときだけ Slack に通知します。条件を空にすると「すべて一致」として扱います。
          </p>

          <form onSubmit={handleAddFilter} className="p-4 rounded-lg bg-white dark:bg-zinc-900 dark:border dark:border-zinc-700 mb-6">
            <h3 className="font-medium text-zinc-800 dark:text-zinc-200 mb-3">新規追加</h3>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
            )}
            <div className="space-y-3">
              <label className="block text-sm">
                フィルタ名（必須）
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 生存リスクのみ"
                  className="mt-1 block w-full max-w-xs border rounded px-2 py-1.5 dark:bg-zinc-800 dark:border-zinc-600"
                />
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="text-sm">
                  公示日 From
                  <input
                    type="date"
                    value={publishedFrom}
                    onChange={(e) => setPublishedFrom(e.target.value)}
                    className="ml-1 border rounded px-2 py-1 dark:bg-zinc-800 dark:border-zinc-600"
                  />
                </label>
                <label className="text-sm">
                  公示日 To
                  <input
                    type="date"
                    value={publishedTo}
                    onChange={(e) => setPublishedTo(e.target.value)}
                    className="ml-1 border rounded px-2 py-1 dark:bg-zinc-800 dark:border-zinc-600"
                  />
                </label>
              </div>
              <fieldset className="text-sm">
                <legend className="font-medium text-zinc-700 dark:text-zinc-300">
                  リスク（いずれかにチェックしたものだけ通知）
                </legend>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={riskSurvival}
                      onChange={(e) => setRiskSurvival(e.target.checked)}
                      className="rounded border-zinc-400"
                    />
                    生存
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={riskFinancial}
                      onChange={(e) => setRiskFinancial(e.target.checked)}
                      className="rounded border-zinc-400"
                    />
                    金銭
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={riskCredit}
                      onChange={(e) => setRiskCredit(e.target.checked)}
                      className="rounded border-zinc-400"
                    />
                    信用
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={riskOther}
                      onChange={(e) => setRiskOther(e.target.checked)}
                      className="rounded border-zinc-400"
                    />
                    その他
                  </label>
                </div>
              </fieldset>
              <label className="block text-sm">
                種別
                <select
                  value={normType}
                  onChange={(e) => setNormType(e.target.value)}
                  className="ml-2 border rounded px-2 py-1 dark:bg-zinc-800 dark:border-zinc-600"
                >
                  <option value="">指定しない</option>
                  {NORM_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                タグ ID（任意）
                <input
                  type="text"
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                  placeholder="Tag.id"
                  className="mt-1 block w-full max-w-xs border rounded px-2 py-1.5 dark:bg-zinc-800 dark:border-zinc-600"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 px-4 py-2 rounded bg-zinc-800 dark:bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-50"
            >
              {submitting ? "追加中…" : "追加"}
            </button>
          </form>

          {/* 一覧 */}
          {filtersLoadError && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
              {filtersLoadError}
            </p>
          )}
          {filters.length === 0 && !filtersLoadError ? (
            <p className="text-sm text-zinc-500">通知用フィルタはまだありません。</p>
          ) : filters.length === 0 ? null : (
            <ul className="space-y-3">
              {filters.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-4 p-3 rounded-lg bg-white dark:bg-zinc-900 dark:border dark:border-zinc-700"
                >
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{f.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {formatCondition(f)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteFilter(f.id)}
                    className="shrink-0 text-sm text-red-600 dark:text-red-400 hover:underline"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

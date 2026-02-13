"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type NormChangeItem = {
  id: string;
  summary: string;
  obligationLevel: string;
  penaltyRisk: string;
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

export default function NormChangesPage() {
  const [items, setItems] = useState<NormChangeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from.replace(/-/g, ""));
    if (to) params.set("to", to.replace(/-/g, ""));
    setLoading(true);
    fetch(`/api/norm-changes?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setItems(data.items);
        else setItems([]);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ja-JP") : "—";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto">
        <nav className="mb-6">
          <Link
            href="/"
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:underline"
          >
            ← トップ
          </Link>
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
                    <span
                      className={
                        item.penaltyRisk === "HIGH"
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-500"
                      }
                    >
                      {item.penaltyRisk !== "NONE"
                        ? `リスク: ${item.penaltyRisk}`
                        : ""}
                    </span>
                    <span className="text-zinc-400">
                      {item.normSource?.type} · 公示日:{" "}
                      {formatDate(item.normSource?.publishedAt ?? null)}
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

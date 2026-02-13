"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Detail = {
  id: string;
  summary: string;
  obligationLevel: string;
  penaltyRisk: string;
  penaltyDetail: string | null;
  effectiveFrom: string | null;
  deadline: string | null;
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
              <dd>{item.normSource?.type ?? "—"}</dd>
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
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              概要・何をしないといけないか
            </h2>
            <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
              {item.summary}
            </p>
          </section>
          {item.normSource?.url && (
            <a
              href={item.normSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline text-sm"
            >
              法令本文（e-Gov）を開く
            </a>
          )}
        </article>
      </div>
    </div>
  );
}

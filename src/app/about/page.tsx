"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Issue #55: 一覧画面の上部にあったサブリンク（Slack通知、生成API、DB接続、アーキテクチャ）を別ページにまとめる。
 */
export default function AboutPage() {
  const [openaiStatus, setOpenaiStatus] = useState<{
    configured: boolean;
    usageUrl?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/openai-usage")
      .then((r) => r.json())
      .then((data) =>
        setOpenaiStatus({ configured: data.configured, usageUrl: data.usageUrl })
      )
      .catch(() => setOpenaiStatus(null));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/norm-changes"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:underline mb-4 inline-block"
        >
          ← 一覧に戻る
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
          設定・システム情報
        </h1>
        <ul className="space-y-4 text-sm">
          <li>
            <a
              href="/settings"
              className="text-zinc-600 dark:text-zinc-400 hover:underline font-medium"
            >
              設定（Slack 通知）
            </a>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              Slack への通知フィルターやチャンネル設定
            </p>
          </li>
          <li>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              生成API（OpenAI）
            </span>
            {openaiStatus === null ? (
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">確認中…</p>
            ) : openaiStatus.configured ? (
              <p className="mt-1">
                <a
                  href={openaiStatus.usageUrl ?? "https://platform.openai.com/usage"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 dark:text-zinc-400 hover:underline"
                >
                  設定済み（利用量を確認）
                </a>
              </p>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                未設定（.env の OPENAI_API_KEY を設定すると AI レポート生成が利用できます）
              </p>
            )}
          </li>
          <li>
            <a
              href="/api/db-health"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-600 dark:text-zinc-400 hover:underline font-medium"
            >
              DB 接続確認
            </a>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              データベース接続の状態確認
            </p>
          </li>
          <li>
            <a
              href="https://github.com/bokunon/norm-change-alerts/blob/main/docs/architecture.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-600 dark:text-zinc-400 hover:underline font-medium"
            >
              アーキテクチャ概要
            </a>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              システム全体構成・データ構造・環境構成
            </p>
          </li>
        </ul>
      </div>
    </div>
  );
}

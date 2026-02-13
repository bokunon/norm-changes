import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          法令インパクト管理
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          法令・省令・政令・ガイドラインの公示を検知し、「誰向けに／何がどう変わり／何をしないといけないか」を一覧・通知します。
        </p>
        <nav className="flex flex-col gap-4">
          <Link
            href="/norm-changes"
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            法令インパクト一覧
          </Link>
          <a
            href="/api/db-health"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:underline"
          >
            DB 接続確認（/api/db-health）
          </a>
        </nav>
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          <a
            href="https://github.com/bokunon/spec-driven-app/blob/main/docs/architecture.md"
            className="underline"
          >
            アーキテクチャ概要
          </a>
          {" · "}
          初回は{" "}
          <code className="bg-zinc-200 dark:bg-zinc-700 px-1 rounded">
            npx prisma migrate deploy
          </code>{" "}
          を実行してください。
        </p>
      </main>
    </div>
  );
}

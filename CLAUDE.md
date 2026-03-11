# norm-changes — プロジェクト固有設定

法令・省令・政令・ガイドラインの公示を検知し、企業向けリスク分析レポートを生成するアプリ。

---

## 技術スタック

- **フレームワーク**: Next.js (App Router) + TypeScript
- **DB**: Supabase (PostgreSQL) + Prisma ORM
- **ホスティング**: Vercel（`main` ブランチ → 本番自動デプロイ）
- **テスト**: vitest（`npm test`）
- **AI**: OpenAI gpt-5-mini（法令リスク分析レポート生成）

## 主要コマンド

```bash
npm run dev          # ローカル開発サーバー起動
npm test             # vitestでテスト実行（100テスト）
npm run build        # prisma migrate deploy && next build
npm run lint         # ESLint
```

## 重要ファイル

| ファイル | 役割 |
|---------|------|
| `src/lib/run-analyze.ts` | NormSource→NormChange生成のメインロジック |
| `src/lib/report-ai.ts` | OpenAIレポート生成（callOpenAI共通化済み） |
| `src/lib/notify-on-change.ts` | 通知フィルタマッチング・Slack送信 |
| `src/proxy.ts` | ADMIN_API_KEY認証・パスブロック（Next.js 16 proxy）|
| `src/lib/schemas.ts` | Zodバリデーションスキーマ |
| `src/lib/logger.ts` | pinoロガー（LOG_LEVEL環境変数対応） |
| `src/app/api/ingest/cron/route.ts` | Vercel Cron（毎日22:00 UTC = 日本7:00）|

## 環境変数（`.env` に記載）

必須: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CRON_SECRET`
管理系API: `ADMIN_API_KEY`
AI: `OPENAI_API_KEY`
Slack: `SLACK_WEBHOOK_URL`
本番URL: `SITE_URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`

## デプロイフロー

- `main` push → GitHub Actions (`deploy-vercel.yml`) → Vercel 本番自動デプロイ
- ステージング環境は別途 Vercel Preview で確認

## 注意事項

- Supabase Transaction mode (port 6543) では `prisma migrate deploy` が失敗する → Session mode (port 5432) の `DIRECT_DATABASE_URL` を使うこと
- `prisma migrate deploy` はビルド時に自動実行される（`package.json` の `build` スクリプト）
- OpenAI未設定時はキーワードフォールバックを使うが、`penaltyDetail` が生成できないため NormChange を登録せず503を返す

# norm-changes

法令・省令・政令・ガイドラインの公示を検知し、「誰向けに／何がどう変わり／何をしないといけないか」を一覧・通知するアプリです。

## ドキュメント

- **[アーキテクチャ概要](docs/architecture.md)** — 全体構成（コンテキスト図）、データ構造（ER図）、環境構成案。実装チケットはここを参照。
- **[Supabase 作成〜接続ハンズオン](docs/supabase-setup.md)** — プロジェクト作成から .env 設定・マイグレーションまで手順付き。

## 初回セットアップ

1. `.env.example` をコピーして `.env` を作成し、`DATABASE_URL` を設定する。
2. DB にマイグレーションを適用する。
   - **Supabase 利用時**:
     - **Transaction mode プーラー（port 6543）**のままだと `prepared statement "s1" already exists` が出ます。
     - 次のどちらかを `.env` の `DIRECT_DATABASE_URL` に設定してから実行してください。
       1. **Direct connection**（`db.xxx.supabase.co:5432`）— デフォルトは **IPv6 のみ**。自宅など IPv4 だけの環境ではつながらないことがあります。
       2. **Session mode プーラー**（`aws-0-xxx.pooler.supabase.com:5432`）— **IPv4 対応**。ダッシュボードの「Connect」→「Session」で URI をコピー。ユーザー名は `postgres.[PROJECT_REF]` 形式です。
   ```bash
   npx prisma migrate deploy
   ```
3. （任意）Slack 通知を使う場合は `.env` に `SLACK_WEBHOOK_URL` を設定する。
4. （任意・Issue #12）企業向けレポートで生成 AI を使う場合は `.env` に `OPENAI_API_KEY` を設定する。未設定ならキーワードのみで動作する。

## OpenAI API Key（Issue #12）

企業向けレポートの生成に OpenAI（gpt-4o-mini 等）を使う場合:

1. **キー取得**: [OpenAI API Keys](https://platform.openai.com/api-keys) で API キーを作成する。
2. **ローカル**: `.env` に次の 1 行を追加し、取得したキーを貼る（値は git に含めない）。
   ```
   OPENAI_API_KEY="sk-..."
   ```
3. **本番（Vercel）**: Vercel の **Settings → Environment Variables** で `OPENAI_API_KEY` を追加し、Production 用の値を設定する。
4. **使用量**: OpenAI の Organization で [Usage limits](https://platform.openai.com/settings/organization/limits) を設定しておくと、予算を超えて課金されない。

未設定の場合は生成 AI を使わず、キーワードベースの判定のみでレポート相当を出す。

## データ取得（ingest）のローカル確認（Issue #14）

e-Gov からのデータ取得（ingest）は本番では **Vercel Cron で一日1回** 実行されます。ローカルで同じ処理を試す方法は次のとおりです。

1. **開発サーバーを起動**  
   ```bash
   npm run dev
   ```

2. **手動で 1 日分だけ実行**（ブラウザまたは curl）  
   - 例: 過去の実在する日付で試す  
   ```bash
   curl "http://localhost:3000/api/ingest/laws?date=20230201"
   ```
   - 日付を省略すると「当日」で実行されます。

3. **複数日分をスクリプトで実行**（改正前全文取得あり・時間がかかります）  
   ```bash
   npm run refresh:ingest -- 20230201 20230207
   ```

4. **Cron エンドポイントをローカルで試す**（オプション）  
   - `.env` に `CRON_SECRET=任意の文字列` を追加し、同じ文字列で Authorization を付けて呼ぶ。  
   ```bash
   curl -H "Authorization: Bearer 任意の文字列" "http://localhost:3000/api/ingest/cron"
   ```
   - このエンドポイントは「UTC の前日」分を 1 日分だけ取り込みます。

本番（Vercel）では `vercel.json` の cron で毎日 22:00 UTC（日本時間 7:00）に `/api/ingest/cron` が呼ばれます。Vercel の Environment Variables に `CRON_SECRET` を設定してください。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

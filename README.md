This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

法令・省令・政令・ガイドラインの公示を検知し、「誰向けに／何がどう変わり／何をしないといけないか」を一覧・通知するアプリです。

## ドキュメント

- **[アーキテクチャ概要](docs/architecture.md)** — 全体構成（コンテキスト図）、データ構造（ER図）、環境構成案。実装チケットはここを参照。

## 初回セットアップ

1. `.env.example` をコピーして `.env` を作成し、`DATABASE_URL` を設定する。
2. DB にマイグレーションを適用する。
   ```bash
   npx prisma migrate deploy
   ```
3. （任意）Slack 通知を使う場合は `.env` に `SLACK_WEBHOOK_URL` を設定する。

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

# GitHub Issue 用本文（仕様書 specs/00-db-tools-setup-plan.md より）

**タイトル**: `DBツール（Prisma + Supabase）セットアップ`

---

## 概要

`.cursorrules` で定めた Tech Stack（Database: Supabase / PostgreSQL, Prisma ORM）に従い、現状不足しているDBツールを導入するためのタスクです。仕様書駆動開発の前提として、DB構造は `prisma/schema.prisma` を正とし、生SQLは書かず Prisma 経由で操作します。

**仕様書**: [specs/00-db-tools-setup-plan.md](../specs/00-db-tools-setup-plan.md)

---

## 現状

| 項目 | 状態 |
|------|------|
| Database (Supabase) | ❌ 未導入 |
| ORM (Prisma) | ❌ 未導入 |
| 環境変数 (.env) | ❌ なし |
| Prisma スキーマ | 未セットアップ |

---

## 実施タスク（Step 1〜6）

### Step 1: Prisma のインストールと初期化
- `prisma` を devDependency、`@prisma/client` を dependency で追加
- `npx prisma init` を実行し、`prisma/schema.prisma` と `.env` を生成

### Step 2: Supabase 用の Prisma 設定
- `prisma/schema.prisma` の `datasource` を PostgreSQL にし、`env("DATABASE_URL")` を参照
- Supabase の接続文字列は Project Settings → Database から取得

### Step 3: 環境変数まわり
- `.env` に `DATABASE_URL` を記載
- `.env.example` を追加（`DATABASE_URL=` のみ、値は空またはプレースホルダー）
- `.gitignore` に `.env` が含まれていることを確認

### Step 4: Prisma Client の生成と Next.js での利用基盤
- `npx prisma generate` でクライアント生成
- `src/lib/prisma.ts` で PrismaClient のシングルトンインスタンスを用意
- 必要なら `package.json` の `postinstall` に `prisma generate` を追加

### Step 5: 初回マイグレーション（任意・スキーマがある場合）
- 仕様に基づき `prisma/schema.prisma` にモデルを定義
- `npx prisma migrate dev --name init` で初回マイグレーション作成・適用

### Step 6: 仕様駆動の前提の確認
- DB変更は `prisma/schema.prisma` 編集 → `prisma migrate dev` でマイグレーション作成
- 生SQLは書かず Prisma Client のみで操作するルールを守る

---

## 受入基準（Acceptance Criteria）

- [ ] `npm install` 後に `npx prisma generate` がエラーなく完了する
- [ ] `.env` に有効な `DATABASE_URL` を設定した状態で、`npx prisma db pull` または `npx prisma migrate dev` が接続できる
- [ ] `src/lib/prisma.ts` から Prisma Client を import し、API Route や Server Component で使用できる
- [ ] `.env.example` が存在し、`DATABASE_URL` の説明が分かる
- [ ] DB 構造の正は `prisma/schema.prisma` であり、生SQLでスキーマを変更しない方針が守れる状態である

---

## 補足

- Supabase ダッシュボードでプロジェクト作成済みが前提
- Connection string は Database → Connection string で「URI」をコピー（Direct connection 推奨）
- 詳細は仕様書 [specs/00-db-tools-setup-plan.md](../specs/00-db-tools-setup-plan.md) を参照

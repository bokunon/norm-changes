# Vercel デプロイで起きたこと・対応・Pro（$20/月）にした場合

「変数をあちこちに置きたくない」という前提で、**起きた内容**と**取った対応**、そして**月 $20 の Pro にすると何が変わるか**をまとめておく。

---

## 1. 起きた内容

- **現象**: GitHub に push すると、Vercel から「このユーザはチームのメンバーではない」旨のメールが届き、**自動デプロイが走らない**。
- **原因**:  
  - Vercel の **Git 連携**は「**誰が push したか**」を GitHub のアイデンティティで見ている。  
  - いまの環境では **Git のユーザ**（例: `naoki@naokinoMacBook-Air.local`）と、**Vercel にログインしているアカウント（GitHub 連携済み）**が一致していない、または「その Git ユーザ」が Vercel のチームメンバーとして認識されていない。
- **結果**: push しても Vercel 側の自動デプロイが拒否される。

---

## 2. 取った対応（無料のまま動かす）

- **方針**: 「誰が push したか」に依存しないようにする。  
  **GitHub Actions** で push を検知し、**Vercel CLI** でデプロイする。デプロイ時に使うのは **Vercel のトークン**なので、**トークンを持っている Vercel アカウント**でデプロイされる。

- **やったこと**  
  1. `.github/workflows/deploy-vercel.yml` を追加（main への push で `vercel pull` → `vercel build` → `vercel deploy --prebuilt --prod` を実行）。  
  2. GitHub の **Actions 用シークレット**に次を登録：  
     - `VERCEL_TOKEN`（Vercel の Account → Tokens で発行）  
     - `VERCEL_ORG_ID`（`vercel link` 後の `.vercel/project.json` の `orgId`）  
     - `VERCEL_PROJECT_ID`（同上の `projectId`）  
  3. 手順は `docs/vercel-deploy-by-cli.md` に記載。

- **トレードオフ（変数が散らばる部分）**  
  - **GitHub**: 上記 3 つのシークレット（VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID）  
  - **Vercel**: 従来どおり環境変数（DATABASE_URL 等）は Vercel の Environment Variables に設定  
  - **ローカル**: `vercel link` 用に `.vercel/project.json` ができる（gitignore 済み）  
  → 「デプロイの認証まわり」の情報が **GitHub のシークレット** と **Vercel のトークン管理** に分かれる。

---

## 3. Pro（$20/月）にした場合に起こること

- **チームに Collaborator を追加できる**  
  - 無料では「Organization のメンバー」を増やせない／制限がきつい。  
  - Pro では **あなたの Vercel チームに、その Git ユーザ（GitHub アカウント）を Collaborator として追加**できる。

- **その結果**  
  - その GitHub アカウントで push すると、**Vercel 標準の「Git 連携による自動デプロイ」**がそのまま動く。  
  - **GitHub Actions で Vercel CLI を回す必要がなくなる**。  
  - **VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID を GitHub のシークレットに置かなくてよい**（Git 連携だけでデプロイできる）。

- **変数まわり**  
  - **Vercel の環境変数**（DATABASE_URL 等）は今と同じく Vercel の Environment Variables のみでよい。  
  - 「デプロイを動かすための認証情報」を GitHub に持たせなくてよくなるので、**設定の置き場所が Vercel に寄る**。

---

## 4. 比較まとめ

| 項目 | いま（無料 + GitHub Actions） | Pro（$20/月）で Git 連携のみ |
|------|--------------------------------|------------------------------|
| デプロイのトリガー | main への push → GitHub Actions が Vercel CLI で実行 | main への push → Vercel の Git 連携が自動実行 |
| 「変数・シークレット」の置き場所 | GitHub（VERCEL_TOKEN, ORG_ID, PROJECT_ID）+ Vercel（環境変数） | Vercel（環境変数）のみ |
| 誰が push しても動くか | 動く（トークンのアカウントでデプロイ） | Collaborator に追加したアカウントの push で動く |
| 月額コスト | $0 | $20 |

「変数をあちこちに置きたくない」なら、**$20/月と引き換えに、GitHub 側の Vercel 用シークレット 3 つが不要になる**、という整理になる。

## 法令インパクト管理システム アーキテクチャ概要

このドキュメントは、法令・省令・政令・ガイドライン等の公示情報から、
「誰向けに／何がどう変わり／何をしないといけないか」を抽出・通知する
システムの全体像とデータ構造、環境構成のたたきを示します。

### 全体構成（コンテキスト図）

```mermaid
flowchart LR
    subgraph Users
        U1[法務・コンプラ]
        U2[各部門責任者（人事・情シスなど）]
    end

    subgraph WebApp
        UI[Web UI]
        API[APIサーバー]
    end

    subgraph DB
        NS[(NormSource)]
        NC[(NormChange)]
        TAG[(Tag関連)]
        UF[(User関連)]
    end

    subgraph Ingest
        CRAWL[法令・ガイドライン取得]
        ANALYZE[解析・要約・タグ付け]
    end

    subgraph Slack
        CH[SlackチャンネルやDM]
    end

    U1 --> UI
    U2 --> UI
    UI <---> API
    API <---> DB

    CRAWL --> ANALYZE --> DB

    API --> SlackNotifier[Slack通知ロジック] --> CH

    CH --> U1
    CH --> U2
```

#### 役割の概要

- `Users`  
  - 法務・コンプラ担当、各部門責任者（人事・情シスなど）
- `WebApp`  
  - Next.js ベースの Web UI と API サーバー
- `DB`  
  - 法令原本や解析結果、タグ、ユーザー設定などの永続化
- `Ingest`  
  - e-Gov 法令 API や各省庁サイトからの取得バッチ、およびテキスト解析・タグ付けロジック
- `Slack`  
  - 関心のある法令インパクトを通知するためのチャンネル／DM

### データ構造（ER 図）

```mermaid
erDiagram
    NORM_SOURCE {
        string id
        string type
        string title
        string number
        string publisher
        string publishedAt
        string effectiveAt
        string url
    }

    NORM_CHANGE {
        string id
        string normSourceId
        string summary
        string obligationLevel
        string penaltyRisk
        string penaltyDetail
        string effectiveFrom
        string deadline
    }

    TAG {
        string id
        string type
        string key
        string labelJa
        string description
    }

    NORM_CHANGE_TAG {
        string id
        string normChangeId
        string tagId
    }

    USER {
        string id
        string name
        string email
        string slackUserId
    }

    USER_FILTER {
        string id
        string userId
        string name
        string includeTagIds
        string excludeTagIds
    }

    NORM_SOURCE ||--o{ NORM_CHANGE : has
    NORM_CHANGE ||--o{ NORM_CHANGE_TAG : tagged_with
    TAG ||--o{ NORM_CHANGE_TAG : used_in
    USER ||--o{ USER_FILTER : owns
```

#### モデル概要

- `NormSource`  
  - 法律・政令・省令・ガイドラインなど一次情報のメタデータとリンクを保持
- `NormChange`  
  - 実務的な「変更点」「対応が必要な論点」の単位
- `Tag` / `NormChangeTag`  
  - 業界・業種・機能領域・データ種別などを表す汎用タグと、その付与関係
- `User` / `UserFilter`  
  - 利用者と、そのユーザーが関心を持つタグ条件（Web のフィルタや Slack 通知条件に利用）

### 環境構成案

現時点では、開発しやすさと運用負荷の軽さを優先し、以下の構成案とします。
今後の要件に応じて変更する前提の「たたき」として扱います。

#### ホスティング・ミドルウェア

- Web / API
  - Vercel 上に Next.js アプリをデプロイ
- データベース
  - Neon（マネージド PostgreSQL）を利用
- バッチ処理（Issue #14）
  - **e-Gov ingest**: Vercel Cron で一日1回 `/api/ingest/cron` を実行（前日分の公示データを取得）。`vercel.json` の `crons` で `0 19 * * *`（毎日 19:00 UTC = 日本時間 4:00 翌日）。本番では Vercel の Environment Variables に `CRON_SECRET` を設定すること。
  - 代替: GitHub Actions の schedule や外部 cron サービスで同エンドポイントを呼ぶことも可能。

#### 環境

- ローカル
  - Next.js: `npm run dev`
  - DB: docker-compose などで PostgreSQL をローカル起動
  - Slack: 開発用 Webhook / App（検証用チャンネル）
- 開発環境（Dev）
  - Vercel: `dev` ブランチを自動デプロイ
  - Neon: Dev 用 DB インスタンス
  - Slack: 開発用チャンネル（例: `#legal-dev`）
- 本番環境（Prod）
  - Vercel: `main` ブランチを Production としてデプロイ
  - Neon: 本番用 DB インスタンス（バックアップ有効化）
  - Slack: 本番通知チャンネル（例: `#legal-alerts`）

#### 環境構成図

```mermaid
flowchart LR
    subgraph Local
        LApp[Next.js dev]
        LDB[(Postgres local)]
    end

    subgraph Dev[Vercel Dev]
        DApp[Next.js dev branch]
        DDB[(Postgres Dev)]
    end

    subgraph Prod[Vercel Prod]
        PApp[Next.js main]
        PDB[(Postgres Prod)]
    end

    LApp <---> LDB
    DApp <---> DDB
    PApp <---> PDB
```

---

このドキュメントは、[Issue #2](https://github.com/bokunon/spec-driven-app/issues/2) で整備したアーキテクチャ共通ドキュメントです。
チケット 3 以降（Prisma スキーマ定義、バッチ実装、Web UI、Slack 連携など）の前提として参照してください。


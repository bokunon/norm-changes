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
        string externalId
        string type
        string title
        string number
        string publisher
        datetime publishedAt
        datetime effectiveAt
        string url
        text rawText
        text rawTextPrev
        string bulkdownloadDate
        datetime createdAt
        datetime updatedAt
    }

    NORM_CHANGE {
        string id
        string normSourceId
        text summary
        text penaltyDetail
        boolean riskSurvival
        boolean riskFinancial
        boolean riskCredit
        boolean riskOther
        datetime effectiveFrom
        json reportActionItems
        json reportDetailedRecommendations
        datetime createdAt
        datetime updatedAt
    }

    TAG {
        string id
        string type
        string key
        string labelJa
        text description
        datetime createdAt
        datetime updatedAt
    }

    NORM_CHANGE_TAG {
        string id
        string normChangeId
        string tagId
        datetime createdAt
    }

    USER {
        string id
        string name
        string email
        string slackUserId
        datetime createdAt
        datetime updatedAt
    }

    USER_FILTER {
        string id
        string userId
        string name
        text includeTagIds
        text excludeTagIds
        datetime createdAt
        datetime updatedAt
    }

    CRON_EXECUTION_LOG {
        string id
        datetime startedAt
        datetime endedAt
        string result
        json processedDates
        text errorMessage
        int durationMs
    }

    INGEST_STATE {
        string id
        string lastSuccessfulDate
        datetime updatedAt
    }

    NOTIFICATION_FILTER {
        string id
        string name
        datetime publishedFrom
        datetime publishedTo
        boolean riskSurvival
        boolean riskFinancial
        boolean riskCredit
        boolean riskOther
        string normType
        string tagId
        datetime createdAt
        datetime updatedAt
    }

    NORM_SOURCE ||--o{ NORM_CHANGE : has
    NORM_CHANGE ||--o{ NORM_CHANGE_TAG : tagged_with
    TAG ||--o{ NORM_CHANGE_TAG : used_in
    USER ||--o{ USER_FILTER : owns
```

#### モデル概要

- `NormSource`
  - 法律・政令・省令・ガイドラインなど一次情報のメタデータとリンクを保持。`rawText`（改正後全文）・`rawTextPrev`（改正前全文）は bulkdownload 取得時にのみ入る。`bulkdownloadDate` は ingest 日付スコープ用
- `NormChange`
  - 実務的な「変更点」「対応が必要な論点」の単位。リスクは `riskSurvival`（業務停止・免許取消等）/ `riskFinancial`（罰金・課徴金等）/ `riskCredit`（社名公表・勧告等）/ `riskOther`（手続き変更等）の4区分。`penaltyDetail` はリスクあり時のみ設定。`reportActionItems` / `reportDetailedRecommendations` は AI 生成レポート（OpenAI）
- `Tag` / `NormChangeTag`
  - 業界・業種・機能領域・データ種別などを表す汎用タグと、その付与関係
- `User` / `UserFilter`
  - 利用者と、そのユーザーが関心を持つタグ条件（Web のフィルタや Slack 通知条件に利用）
- `CronExecutionLog`
  - ingest cron の実行ごとのログ（開始・終了・結果・処理日付一覧・エラー等を永続化）
- `IngestState`
  - ingest の進捗カーソル（1行のみ）。`lastSuccessfulDate` は「この日まで ingest と analyze 両方完了」を示し、次回 cron はその翌日から再開
- `NotificationFilter`
  - Slack 通知用フィルタ。新規 NormChange がこの条件（リスク区分・公示日範囲・種別・タグ）に一致したときのみ Slack 通知

### 環境構成案

現時点では、開発しやすさと運用負荷の軽さを優先し、以下の構成案とします。
今後の要件に応じて変更する前提の「たたき」として扱います。

#### ホスティング・ミドルウェア

- Web / API
  - Vercel 上に Next.js アプリをデプロイ
- データベース
  - Supabase（マネージド PostgreSQL）を利用
- バッチ処理（Issue #14）
  - **e-Gov ingest**: Vercel Cron で一日1回 `/api/ingest/cron` を実行（前日分の公示データを取得）。`vercel.json` の `crons` で `0 22 * * *`（毎日 22:00 UTC = 日本時間 7:00）。本番では Vercel の Environment Variables に `CRON_SECRET` を設定すること。
  - 代替: GitHub Actions の schedule や外部 cron サービスで同エンドポイントを呼ぶことも可能。

#### 環境

- ローカル
  - Next.js: `npm run dev`
  - DB: docker-compose などで PostgreSQL をローカル起動
  - Slack: 開発用 Webhook / App（検証用チャンネル）
- 開発環境（Dev）
  - Vercel: `dev` ブランチを自動デプロイ
  - Supabase: Dev 用 DB インスタンス
  - Slack: 開発用チャンネル（例: `#legal-dev`）
- 本番環境（Prod）
  - Vercel: `main` ブランチを Production としてデプロイ
  - Supabase: 本番用 DB インスタンス（バックアップ有効化）
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

このドキュメントは、[Issue #2](https://github.com/bokunon/norm-changes/issues/2) で整備したアーキテクチャ共通ドキュメントです。
チケット 3 以降（Prisma スキーマ定義、バッチ実装、Web UI、Slack 連携など）の前提として参照してください。


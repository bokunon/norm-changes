# 法令インパクト管理システム - API 仕様書

## 1. API 概要

### 1.1 ベース URL
- **開発**: `http://localhost:3000`
- **本番**: `https://[vercel-domain]`

### 1.2 認証
- **認証方式**: Bearer Token (Cron エンドポイントのみ)
- **ヘッダー**: `Authorization: Bearer <CRON_SECRET>`
- **その他 API**: 認証なし（本番では要検討）

### 1.3 レスポンス形式
すべてのレスポンスは JSON 形式です。

```json
{
  "data": {},
  "error": null,
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

## 2. API エンドポイント一覧

| メソッド | パス | 説明 | 認証 | 実装状況 |
|---------|------|------|------|--------|
| GET | `/api/norm-changes` | 法令変更一覧 | 不要 | ✅ |
| GET | `/api/norm-changes/[id]` | 詳細取得 | 不要 | ✅ |
| POST | `/api/ingest/laws` | 手動取得 | 不要 | ✅ |
| POST | `/api/ingest/cron` | Cron自動実行 | 必要 | ✅ |
| GET | `/api/ingest/state` | 状態確認 | 不要 | ✅ |
| GET | `/api/ingest/cron-logs` | Cron実行ログ | 不要 | ✅ |
| POST | `/api/analyze` | 手動解析 | 不要 | ✅ |
| GET/POST | `/api/notification-filters` | フィルタCRUD | 不要 | ✅ |
| GET/PUT/DELETE | `/api/notification-filters/[id]` | フィルタ詳細CRUD | 不要 | ✅ |
| POST | `/api/slack-config` | Slack設定更新 | 不要 | ✅ |
| GET | `/api/openai-usage` | OpenAI使用量 | 不要 | ✅ |
| GET | `/api/db-health` | DB接続確認 | 不要 | ✅ |
| GET | `/api/debug-openai-env` | OpenAI環境確認 | 不要 | ✅ |

---

## 3. 詳細エンドポイント仕様

### 3.1 GET /api/norm-changes

#### 説明
法令変更一覧を取得（検索・フィルタリング対応）

#### リクエスト

**パラメータ（クエリ）:**
```
GET /api/norm-changes?q=個人情報&tags=finance&risk=survival&page=1&limit=20&sort=published:desc
```

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|----|----|------|-----|
| `q` | string | N | フリーテキスト検索 | "個人情報保護" |
| `tags` | string | N | タグID（カンマ区切り） | "tag-finance,tag-hr" |
| `risk` | string | N | リスク種別 | "survival" "financial" "credit" "other" |
| `page` | number | N | ページ番号（デフォルト: 1） | 1 |
| `limit` | number | N | 1ページの件数（デフォルト: 20, 最大: 100） | 20 |
| `sort` | string | N | ソート（デフォルト: created:desc） | "published:desc" "risk:asc" |

#### レスポンス (200 OK)

```json
{
  "data": [
    {
      "id": "change-001",
      "normSource": {
        "id": "source-001",
        "externalId": "law-001",
        "type": "LAW",
        "title": "個人情報の保護に関する法律の改正",
        "number": "令和5年法律第35号",
        "publisher": "内閣官房",
        "publishedAt": "2023-04-01T00:00:00Z",
        "effectiveAt": "2024-04-01T00:00:00Z",
        "url": "https://www.e-gov.go.jp/..."
      },
      "summary": "個人情報取扱事業者の義務が強化...",
      "risks": {
        "survival": false,
        "financial": true,
        "credit": true,
        "other": false
      },
      "penaltyDetail": "違反時は100万円以下の罰金",
      "tags": [
        {
          "id": "tag-001",
          "type": "INDUSTRY",
          "key": "finance",
          "labelJa": "金融",
          "description": null
        }
      ],
      "report": {
        "actionItems": [
          "個人情報保護方針を改訂",
          "従業員教育を実施",
          "システム監査を実施"
        ],
        "detailedRecommendations": [
          {
            "action": "個人情報保護方針を改訂",
            "basis": "法第15条第2項"
          }
        ]
      },
      "effectiveFrom": "2024-04-01T00:00:00Z",
      "createdAt": "2023-04-02T10:00:00Z",
      "updatedAt": "2023-04-02T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  },
  "filters": {
    "appliedTags": ["tag-finance", "tag-hr"],
    "appliedRisk": "survival"
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

#### エラーレスポンス

**400 Bad Request - 無効なパラメータ**
```json
{
  "error": "Invalid query parameters: limit must be <= 100",
  "timestamp": "2026-03-03T12:00:00Z"
}
```

**500 Internal Server Error**
```json
{
  "error": "Database connection failed",
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.2 GET /api/norm-changes/[id]

#### 説明
特定の法令変更の詳細情報を取得

#### リクエスト

```
GET /api/norm-changes/change-001
```

| パラメータ | 型 | 説明 |
|-----------|----|----|
| `id` | string | NormChange ID |

#### レスポンス (200 OK)

```json
{
  "data": {
    "normChange": {
      "id": "change-001",
      "summary": "個人情報取扱事業者の義務が強化...",
      "penaltyDetail": "違反時は100万円以下の罰金",
      "risks": {
        "survival": false,
        "financial": true,
        "credit": true,
        "other": false
      },
      "tags": [
        {
          "id": "tag-001",
          "type": "INDUSTRY",
          "key": "finance",
          "labelJa": "金融"
        }
      ],
      "report": {
        "actionItems": ["項目1", "項目2"],
        "detailedRecommendations": [
          {
            "action": "...",
            "basis": "法第15条"
          }
        ]
      },
      "effectiveFrom": "2024-04-01T00:00:00Z",
      "createdAt": "2023-04-02T10:00:00Z",
      "updatedAt": "2023-04-02T10:00:00Z"
    },
    "normSource": {
      "id": "source-001",
      "externalId": "law-001",
      "type": "LAW",
      "title": "個人情報の保護に関する法律の改正",
      "number": "令和5年法律第35号",
      "publisher": "内閣官房",
      "publishedAt": "2023-04-01T00:00:00Z",
      "effectiveAt": "2024-04-01T00:00:00Z",
      "url": "https://www.e-gov.go.jp/...",
      "rawText": "（法律本文）...",
      "rawTextPrev": "（改正前全文）..."
    }
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

#### エラーレスポンス

**404 Not Found**
```json
{
  "error": "NormChange not found",
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.3 POST /api/ingest/laws

#### 説明
手動で法令データを取得（スケジューラーに頼らずに実行）

#### リクエスト

```
POST /api/ingest/laws
Content-Type: application/json

{
  "date": "20230401",
  "includeFullText": true
}
```

| パラメータ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| `date` | string | N | yyyyMMdd形式。省略時は当日 |
| `includeFullText` | boolean | N | 改正前後全文を取得（デフォルト: true） |

#### レスポンス (200 OK)

```json
{
  "data": {
    "status": "completed",
    "processedDates": ["20230401"],
    "stats": {
      "created": 15,
      "updated": 3,
      "skipped": 2
    },
    "nextAnalysisTime": "2026-03-03T12:05:00Z",
    "durationMs": 12345
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

#### エラーレスポンス

**400 Bad Request - 無効な日付**
```json
{
  "error": "Invalid date format. Use yyyyMMdd",
  "timestamp": "2026-03-03T12:00:00Z"
}
```

**503 Service Unavailable - e-Gov API エラー**
```json
{
  "error": "Failed to fetch from e-Gov API after 3 retries",
  "detail": "Connection timeout",
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.4 POST /api/ingest/cron

#### 説明
Vercel Cron から呼び出され、自動的に前日分の法令データを取得（内部用）

#### リクエスト

```
POST /api/ingest/cron
Content-Type: application/json
Authorization: Bearer <CRON_SECRET>

{}
```

#### レスポンス (200 OK)

```json
{
  "data": {
    "status": "ok",
    "message": "Ingest and analysis completed successfully",
    "processedDates": ["20260302"],
    "stats": {
      "created": 8,
      "updated": 1,
      "skipped": 0
    },
    "durationMs": 45678,
    "notificationsSent": 3
  },
  "timestamp": "2026-03-03T19:00:00Z"
}
```

#### エラーレスポンス

**401 Unauthorized - CRON_SECRET 不一致**
```json
{
  "error": "Invalid or missing Authorization header",
  "timestamp": "2026-03-03T19:00:00Z"
}
```

**500 Internal Server Error - 処理失敗**
```json
{
  "data": {
    "status": "error",
    "message": "Failed to process ingest",
    "errorDetail": "Database transaction timeout",
    "durationMs": 30000
  },
  "timestamp": "2026-03-03T19:00:00Z"
}
```

---

### 3.5 GET /api/ingest/state

#### 説明
Ingest の進捗状態を確認（最後に成功した日付を返す）

#### リクエスト

```
GET /api/ingest/state
```

#### レスポンス (200 OK)

```json
{
  "data": {
    "lastSuccessfulDate": "20260302",
    "lastSuccessfulAt": "2026-03-03T19:45:00Z",
    "nextScheduledRun": "2026-03-04T19:00:00Z"
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.6 GET /api/ingest/cron-logs

#### 説明
Cron 実行ログを取得（監視・デバッグ用）

#### リクエスト

```
GET /api/ingest/cron-logs?limit=10&status=ok
```

| パラメータ | 型 | 説明 |
|-----------|----|----|
| `limit` | number | 取得件数（デフォルト: 10, 最大: 100） |
| `status` | string | フィルタ（ok, error, aborted） |

#### レスポンス (200 OK)

```json
{
  "data": [
    {
      "id": "log-001",
      "startedAt": "2026-03-03T19:00:00Z",
      "endedAt": "2026-03-03T19:01:23Z",
      "result": "ok",
      "processedDates": ["20260302"],
      "durationMs": 83000,
      "errorMessage": null
    },
    {
      "id": "log-002",
      "startedAt": "2026-03-02T19:00:00Z",
      "endedAt": "2026-03-02T19:00:45Z",
      "result": "error",
      "processedDates": [],
      "durationMs": 45000,
      "errorMessage": "e-Gov API returned 503"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 10
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.7 POST /api/analyze

#### 説明
Analyze 処理を手動で実行（特定日付の NormSource について解析）

#### リクエスト

```
POST /api/analyze
Content-Type: application/json

{
  "bulkdownloadDate": "20230401"
}
```

| パラメータ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| `bulkdownloadDate` | string | Y | yyyyMMdd形式。この日付で取得した NormSource が対象 |

#### レスポンス (200 OK)

```json
{
  "data": {
    "status": "completed",
    "analyzed": 12,
    "failed": 0,
    "skipped": 3,
    "durationMs": 54321,
    "reportGenerated": 8
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.8 GET /api/notification-filters

#### 説明
Slack 通知フィルタ一覧を取得

#### リクエスト

```
GET /api/notification-filters
```

#### レスポンス (200 OK)

```json
{
  "data": [
    {
      "id": "filter-001",
      "name": "生存リスク + 金融",
      "publishedFrom": "2023-01-01T00:00:00Z",
      "publishedTo": null,
      "risks": {
        "survival": true,
        "financial": false,
        "credit": false,
        "other": false
      },
      "normType": null,
      "tag": {
        "id": "tag-001",
        "key": "finance",
        "labelJa": "金融"
      },
      "createdAt": "2026-01-01T10:00:00Z",
      "updatedAt": "2026-01-01T10:00:00Z"
    }
  ],
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.9 POST /api/notification-filters

#### 説明
新しい Slack 通知フィルタを作成

#### リクエスト

```
POST /api/notification-filters
Content-Type: application/json

{
  "name": "生存リスク + 金融",
  "publishedFrom": "2023-01-01T00:00:00Z",
  "publishedTo": null,
  "riskSurvival": true,
  "riskFinancial": false,
  "riskCredit": false,
  "riskOther": false,
  "normType": null,
  "tagId": "tag-001"
}
```

#### レスポンス (201 Created)

```json
{
  "data": {
    "id": "filter-002",
    "name": "生存リスク + 金融",
    "createdAt": "2026-03-03T12:00:00Z"
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.10 PUT /api/notification-filters/[id]

#### 説明
Slack 通知フィルタを更新

#### リクエスト

```
PUT /api/notification-filters/filter-001
Content-Type: application/json

{
  "name": "生存リスク + 金融（更新）",
  "riskSurvival": true
}
```

#### レスポンス (200 OK)

```json
{
  "data": {
    "id": "filter-001",
    "name": "生存リスク + 金融（更新）",
    "updatedAt": "2026-03-03T12:00:00Z"
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.11 DELETE /api/notification-filters/[id]

#### 説明
Slack 通知フィルタを削除

#### リクエスト

```
DELETE /api/notification-filters/filter-001
```

#### レスポンス (204 No Content)

```
(empty body)
```

---

### 3.12 POST /api/slack-config

#### 説明
Slack Webhook URL を設定（環境変数の動的更新）

#### リクエスト

```
POST /api/slack-config
Content-Type: application/json

{
  "webhookUrl": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX"
}
```

#### レスポンス (200 OK)

```json
{
  "data": {
    "status": "configured",
    "testMessageSent": true
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.13 GET /api/openai-usage

#### 説明
OpenAI API の使用量・コスト情報を取得

#### リクエスト

```
GET /api/openai-usage
```

#### レスポンス (200 OK)

```json
{
  "data": {
    "totalRequests": 245,
    "totalTokensUsed": 45678,
    "totalCost": 1.23,
    "currency": "USD",
    "lastResetDate": "2026-03-01T00:00:00Z",
    "currentMonth": "2026-03"
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.14 GET /api/db-health

#### 説明
データベース接続確認（ヘルスチェック）

#### リクエスト

```
GET /api/db-health
```

#### レスポンス (200 OK)

```json
{
  "data": {
    "status": "connected",
    "database": "PostgreSQL",
    "responseTimeMs": 12,
    "tables": {
      "normSource": 150,
      "normChange": 450,
      "tags": 85,
      "users": 10
    }
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

**503 Service Unavailable - DB 接続失敗**

```json
{
  "data": {
    "status": "disconnected",
    "error": "Connection refused"
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

### 3.15 GET /api/debug-openai-env

#### 説明
OpenAI 環境設定の確認（デバッグ用）

#### リクエスト

```
GET /api/debug-openai-env
```

#### レスポンス (200 OK)

```json
{
  "data": {
    "openaiApiKeySet": true,
    "apiKeyLastCharacters": "...xxxx",
    "modelUsed": "gpt-4o-mini",
    "orgId": "org-1234567890",
    "environment": "production"
  },
  "timestamp": "2026-03-03T12:00:00Z"
}
```

---

## 4. 共通ヘッダー

### リクエストヘッダー

```
Content-Type: application/json
Authorization: Bearer <token> (Cronのみ)
User-Agent: norm-change-alerts/0.1.0
```

### レスポンスヘッダー

```
Content-Type: application/json; charset=utf-8
X-Request-Id: <uuid>
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1678012800
```

---

## 5. エラーコード一覧

| コード | 説明 |
|--------|------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request (無効なパラメータ) |
| 401 | Unauthorized (認証失敗) |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable (e-Gov API, DB接続エラー) |

---

## 6. レート制限

**現在は制限なし。本番環境では以下を検討:**

- クライアント IP: 1000 req/hour
- API Key: 10000 req/hour

---

**最終更新**: 2026-03-03
**対象バージョン**: v0.1.0

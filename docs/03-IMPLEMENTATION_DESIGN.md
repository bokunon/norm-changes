# 法令インパクト管理システム - 実装設計（モジュール詳細仕様）

## 1. Ingest モジュール設計

### 1.1 e-Gov API 連携 (`lib/egov-api.ts`)

```typescript
// 概要: e-Gov 法令API からの法令情報取得

interface GetLawsParams {
  date: string; // yyyyMMdd
  limit?: number; // デフォルト: 300
}

interface EGovLaw {
  LawId: string;
  LawNo: number;
  LawType: string; // "Law" | "Ordinance" | "Regulation" | ...
  LawTitle: string;
  PromulgationDate: string; // yyyy-MM-dd
  EnforcementDate?: string;
  EffectiveDate?: string;
  FullText: string; // 本文URL
  MainProvisions?: string[];
  SupplementaryProvisions?: string[];
}

// 主要関数
export async function getLawsByDate(params: GetLawsParams): Promise<EGovLaw[]>
// 戻り値: 指定日付に公示された法令リスト

export async function downloadFullText(lawId: string): Promise<string>
// 戻り値: 改正後全文（改正前全文も別途取得）
```

**処理フロー:**
1. 指定日付で e-Gov API を呼び出し
2. 返却された LawId リストをパース
3. 各 LawId について本文URL (FullText) を取得
4. ZIP/XML を解析（`bulkdownload.ts` に委譲）
5. テキスト抽出

**エラー処理:**
- API タイムアウト → リトライ (最大3回, 指数バックオフ)
- 無効な日付 → 400 エラー
- データ不整合 → ログ出力 + 続行

---

### 1.2 ZIP/XML 処理 (`lib/bulkdownload.ts`)

```typescript
// 概要: e-Gov Bulk Download の ZIP/XML 解析

interface BulkdownloadEntry {
  lawId: string;
  lawNo: string;
  lawType: string;
  lawTitle: string;
  promulgationDate: string;
  enforcementDate: string;
  fullText: string; // 改正後全文
  fullTextPrev?: string; // 改正前全文
}

// 主要関数
export async function extractFromZip(
  zipBuffer: Buffer
): Promise<BulkdownloadEntry[]>
// ZIP から Law*.xml を抽出 → Parse → エントリーに変換

export function parseXml(xmlContent: string): Partial<BulkdownloadEntry>
// XMLContent → 構造化データに変換
```

**処理詳細:**
- adm-zip で ZIP 展開
- fast-xml-parser で XML パース
- iconv-lite で文字エンコーディング（Shift-JIS → UTF-8）変換

**チェック項目:**
- ファイルが壊れていないか
- 必須フィールド (lawId, lawTitle) の存在確認
- テキスト長の妥当性確認

---

### 1.3 法令取得・正規化 (`lib/ingest-laws.ts`)

```typescript
// 概要: Bulkdownload → NormSource/NormChange への変換

interface NormSourceInput {
  externalId: string; // e-Gov lawId
  type: string; // "LAW" | "ORDINANCE" | ...
  title: string;
  number?: string;
  publisher?: string;
  publishedAt: Date;
  effectiveAt?: Date;
  url?: string;
  rawText: string;
  rawTextPrev?: string;
  bulkdownloadDate: string; // yyyyMMdd
}

export async function ingestLaws(entries: BulkdownloadEntry[]): Promise<{
  created: number;
  updated: number;
  skipped: number;
}>;
// 各エントリーを DB に保存（重複チェック: externalId）

export async function normalizeText(rawText: string): string;
// テキスト前処理: 正規化, 改行処理
```

**処理フロー:**
1. `externalId` で重複チェック（既存なら更新、新規なら作成）
2. 法令タイプを NormSourceType に変換
3. テキスト正規化（メタ情報削除など）
4. Prisma で DB 保存

---

### 1.4 進捗状態管理 (`lib/ingest-state.ts`)

```typescript
// 概要: Ingest の進捗管理（どこまで取得済みかを記録）

export async function getLastSuccessfulDate(): Promise<string | null>
// 戻り値: yyyyMMdd or null

export async function updateLastSuccessfulDate(date: string): Promise<void>
// IngestState.lastSuccessfulDate を更新
// → 次回の Ingest は翌日から開始

export async function getIngestDates(
  from: string,
  to: string
): Promise<string[]>
// from ～ to の未取得日付リストを返す（手動実行用）
```

**特徴:**
- IngestState テーブルは単一レコード (id = "default")
- トランザクション性を確保（複数実行の競合回避）

---

## 2. Analyze モジュール設計

### 2.1 テキスト解析 (`lib/analyze.ts`)

```typescript
// 概要: テキストからリスク判定・タグ付与

interface AnalysisResult {
  summary: string; // 要約（最初の500文字など）
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  riskOther: boolean;
  penaltyDetail?: string; // ペナルティ詳細文
  suggestedTags: string[]; // tag.key リスト
}

export async function analyzeText(normSource: NormSource): Promise<AnalysisResult>
// テキスト → リスク判定・タグ推奨

async function extractKeywords(text: string): Promise<{
  survivalKeywords: string[];
  financialKeywords: string[];
  creditKeywords: string[];
  otherKeywords: string[];
}>;
// キーワード抽出（risk-keyword-fallback.ts に委譲）

async function extractPenaltyDetail(text: string): Promise<string>;
// ペナルティ詳細文を抽出
```

**リスク判定アルゴリズム:**
1. `risk-keyword-fallback.ts` でキーワードマッチング
2. 各リスク種別ごとにスコア計算
3. スコア > 閾値なら true に設定

---

### 2.2 リスク判定ロジック (`lib/risk-keyword-fallback.ts`)

```typescript
// 概要: キーワードベースのリスク判定

interface RiskKeywordSet {
  survival: RegExp[];  // 業務停止・免許取消
  financial: RegExp[]; // 罰金・課徴金
  credit: RegExp[];    // 社名公表・勧告
}

const RISK_KEYWORDS: RiskKeywordSet = {
  survival: [
    /業務停止/g,
    /許可取消/g,
    /免許取消/g,
    // ...
  ],
  financial: [
    /罰金/g,
    /課徴金/g,
    /追徴税/g,
    // ...
  ],
  credit: [
    /社名公表/g,
    /改善勧告/g,
    // ...
  ]
};

export function classifyRisks(text: string): {
  riskSurvival: boolean;
  riskFinancial: boolean;
  riskCredit: boolean;
  riskOther: boolean;
}
// キーワードマッチングでリスク分類
```

**特徴:**
- Regex ベースで高速・確実
- キーワード辞書は定期更新が必要

---

### 2.3 AI レポート生成 (`lib/report-ai.ts`)

```typescript
// 概要: OpenAI API を使用した詳細レポート生成

interface ReportGenerationInput {
  lawTitle: string;
  lawType: string;
  fullText: string; // 改正後全文
  fullTextPrev?: string; // 改正前全文
  risks: {
    survival: boolean;
    financial: boolean;
    credit: boolean;
    other: boolean;
  };
}

interface GeneratedReport {
  actionItems: string[]; // ["契約書の改訂", "従業員教育実施", ...]
  detailedRecommendations: Array<{
    action: string;
    basis: string; // 根拠となった法令条項
  }>;
  generatedAt: Date;
}

export async function generateReport(
  input: ReportGenerationInput
): Promise<GeneratedReport>
// OpenAI API でレポート生成

async function buildPrompt(input: ReportGenerationInput): string;
// プロンプト組立（日本語で法務的な指示）

async function parseResponse(response: string): GeneratedReport;
// OpenAI レスポンス (JSON) をパース
```

**プロンプト例:**
```
あなたは企業法務の専門家です。以下の法令変更について、
企業が取るべき対応アクションを提案してください。

法令タイトル: [title]
リスク分類: [survival/financial/credit/other]

変更点:
[改正後テキスト]

対応が必要な場合、JSON形式で以下を提案してください:
{
  "actionItems": ["アクション1", "アクション2", ...],
  "detailedRecommendations": [
    {"action": "...", "basis": "..."},
    ...
  ]
}
```

---

### 2.4 実行制御 (`lib/run-analyze.ts`)

```typescript
// 概要: Analyze 処理の全体制御

export async function runAnalyzeForDate(
  bulkdownloadDate: string // yyyyMMdd
): Promise<{
  analyzed: number;
  failed: number;
  skipped: number;
}>;
// 1. bulkdownloadDate に対応する NormSource を取得
// 2. 各々について analyze() を実行
// 3. NormChange を作成・保存
// 4. Report を生成（OpenAI Key 設定時のみ）
```

---

## 3. Notification モジュール設計

### 3.1 フィルタマッチング (`lib/notification-filter-match.ts`)

```typescript
// 概要: NormChange が NotificationFilter に一致するか判定

interface NotificationFilterMatch {
  filterId: string;
  matchScore: number; // 0.0 ～ 1.0
  reason: string; // マッチ理由
}

export function matchFilter(
  normChange: NormChange,
  normSource: NormSource,
  filter: NotificationFilter
): boolean
// 各条件を AND 結合で判定

// 判定項目:
// 1. publishedFrom ～ publishedTo: normSource.publishedAt が範囲内か
// 2. riskSurvival/Financial/Credit/Other: 対応する risk フラグが true か
// 3. normType: 法令種別が一致するか
// 4. tagId: 指定タグが normChange に付与されているか
```

**マッチング例:**
```typescript
// Filter: "生存リスク + 金融業界"
// NormChange: "riskSurvival=true, tags=[Finance]" → Match!
```

---

### 3.2 Slack 通知 (`lib/slack.ts`)

```typescript
// 概要: Slack Webhook による通知送信

interface SlackMessageInput {
  normSourceTitle: string;
  normSourceType: string;
  normChangeId: string;
  summary: string;
  risks: {
    survival: boolean;
    financial: boolean;
    credit: boolean;
    other: boolean;
  };
  tags: string[];
  reportUrl?: string;
}

export async function sendNotification(
  input: SlackMessageInput
): Promise<void>
// Slack Webhook でメッセージ送信

function buildMessage(input: SlackMessageInput): {
  text: string;
  blocks: SlackBlock[];
}
// メッセージのビルド（Slack ブロック形式）
```

**メッセージ例:**
```
🚨 新しい法令インパクトが検出されました

タイトル: 個人情報保護方針の改訂
種別: ガイドライン
リスク: 信用リスク ⚠️

対応が必要な論点:
- 同意書の更新
- プライバシーポリシーの改訂
- 従業員教育

詳細: [Web UI Link]
```

---

## 4. API Routes 仕様

### 4.1 法令変更一覧 (`api/norm-changes`)

```typescript
// GET /api/norm-changes

interface QueryParams {
  q?: string;        // フリーテキスト検索
  tags?: string;     // タグ ID (カンマ区切り)
  risk?: string;     // risk-type (survival|financial|credit|other)
  page?: number;     // ページネーション（デフォルト: 1）
  limit?: number;    // 1ページの件数（デフォルト: 20, 最大: 100）
  sort?: string;     // sort-key (published|created|risk) + 向き (asc|desc)
}

interface Response {
  data: NormChange[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  filters: {
    appliedTags: string[];
    appliedRisk?: string;
  };
}

// 処理フロー:
// 1. クエリパラメータをバリデーション
// 2. Prisma クエリを組立（WHERE/ORDERBY/SKIP/TAKE）
// 3. 結果をレスポンス形式に変換
```

---

### 4.2 詳細取得 (`api/norm-changes/[id]`)

```typescript
// GET /api/norm-changes/:id

interface Response {
  normChange: {
    id: string;
    summary: string;
    risks: {
      survival: boolean;
      financial: boolean;
      credit: boolean;
      other: boolean;
    };
    tags: string[];
    report?: {
      actionItems: string[];
      detailedRecommendations: Array<{ action: string; basis: string }>;
    };
    effectiveFrom?: string;
    createdAt: string;
  };
  normSource: {
    id: string;
    type: string;
    title: string;
    number?: string;
    publisher?: string;
    publishedAt: string;
    effectiveAt?: string;
    url?: string;
    rawText: string;
    rawTextPrev?: string;
  };
}

// 処理フロー:
// 1. ID で NormChange を取得
// 2. 関連の NormSource も取得
// 3. Response 形式に変換
```

---

### 4.3 Ingest （手動実行）(`api/ingest/laws`)

```typescript
// POST /api/ingest/laws

interface RequestBody {
  date: string; // yyyyMMdd (オプション: 省略時は当日)
  includeFullText?: boolean; // デフォルト: true
}

interface Response {
  status: "pending" | "completed" | "failed";
  processedDates: string[];
  stats: {
    created: number;
    updated: number;
    skipped: number;
  };
  nextAnalysisTime?: string; // 解析予定時刻
}

// 処理フロー:
// 1. Ingest 実行（laws/route.ts -> ingest-laws.ts）
// 2. 成功時は Analyze をトリガー（run-analyze.ts）
// 3. 結果をログに記録
```

---

### 4.4 Ingest Cron (`api/ingest/cron`)

```typescript
// POST /api/ingest/cron
// Authorization: Bearer <CRON_SECRET>

interface Response {
  status: "ok" | "error" | "aborted";
  message: string;
  durationMs: number;
  processedDates: string[];
  errorDetail?: string;
}

// 処理フロー:
// 1. CRON_SECRET で Authorization 検証
// 2. IngestState.lastSuccessfulDate から開始日を決定
// 3. 前日分の法令を取得（一日分のみ）
// 4. Analyze を実行
// 5. CronExecutionLog に記録
```

---

### 4.5 Notification Filter Management

```typescript
// GET/POST /api/notification-filters

// GET: フィルタ一覧取得
// Response: { data: NotificationFilter[], total: number }

// POST: フィルタ新規作成
// Body: { name, publishedFrom, publishedTo, risks: {survival, financial, ...}, normType, tagId }

// PUT /api/notification-filters/:id - 更新
// DELETE /api/notification-filters/:id - 削除
```

---

## 5. データベーストランザクション設計

### 5.1 Ingest トランザクション
```typescript
// Ingest 処理全体をトランザクションで囲む
await prisma.$transaction(async (tx) => {
  // 1. 重複チェック
  const existing = await tx.normSource.findUnique({
    where: { externalId: entry.externalId }
  });

  // 2. NormSource 作成または更新
  const normSource = await tx.normSource.upsert({...});

  // 3. NormChange 作成
  const normChange = await tx.normChange.create({...});

  // 4. IngestState 更新
  await tx.ingestState.update({...});
}, {
  timeout: 30000, // 30秒タイムアウト
});
```

### 5.2 Analyze トランザクション
```typescript
// Analyze 処理全体をトランザクションで囲む
await prisma.$transaction(async (tx) => {
  // 1. NormChange 更新（リスク・レポート）
  await tx.normChange.update({...});

  // 2. タグ削除（既存分）
  await tx.normChangeTag.deleteMany({...});

  // 3. タグ新規作成
  for (const tagId of suggestedTags) {
    await tx.normChangeTag.create({...});
  }
}, {
  timeout: 60000, // 60秒タイムアウト
});
```

---

## 6. エラーハンドリング戦略

### 6.1 リトライ政策

| エラー | リトライ | 上限 | 処理 |
|--------|---------|------|------|
| e-Gov API タイムアウト | 指数バックオフ | 3回 | ログ + 部分スキップ |
| OpenAI API エラー | リトライなし | - | ログ + nullで続行 |
| DB 接続エラー | 即座に失敗 | - | ログ + 終了 |
| XML パース エラー | リトライなし | - | ログ + 該当エントリースキップ |

### 6.2 ロギング

```typescript
// 各モジュールで構造化ログを出力
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: "info" | "warn" | "error",
  module: "ingest-laws",
  action: "upsert-norm-source",
  externalId: "...",
  result: "success" | "failed",
  detail: {...}
}));
```

---

**最終更新**: 2026-03-03
**対象バージョン**: v0.1.0

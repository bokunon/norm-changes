# 現状仕様とギャップ整理

「とりあえず動いた」状態の仕様を整理し、想定しているフロー（日付指定ZIP取得 → 履歴で公示済み施行前取得 → 企業向けレポート）との差分をまとめます。

---

## 1. 現状で使っている e-Gov API

**使用しているエンドポイントは 1 つだけです。**

| 用途 | エンドポイント | 説明 |
|------|----------------|------|
| 更新法令一覧取得 | `GET https://laws.e-gov.go.jp/api/1/updatelawlists/{yyyyMMdd}` | 指定日に**更新された**法令の一覧を XML で取得 |

**リファレンス**

- **法令API利用者向け仕様書（公式PDF）**: [https://laws.e-gov.go.jp/file/houreiapi_shiyosyo.pdf](https://laws.e-gov.go.jp/file/houreiapi_shiyosyo.pdf)  
  - 上記 PDF 内で「更新法令一覧取得」APIの仕様が定義されている。指定した日付（yyyyMMdd、2020年11月24日以降・未来日不可）に更新された法令の一覧を **XML 形式**で取得できる旨が記載されている。
- 2020年11月24日版（1.3版）で当APIが追加。2024年7月29日版（1.4版）でリクエストのホストが `elaws.e-gov.go.jp` から `laws.e-gov.go.jp` に変更。

- **ZIP は使っていません**。レスポンスは XML です。
- 取得できるのは「その日に更新された法令」の**メタデータ**（法令名・番号・公示日・施行日・LawId・LawUrl・施行フラグなど）のみで、**条文本文（rawText）は取得していません**。  
  そのため DB の `NormSource.rawText` は常に `null` のままです。

---

## 2. 日付指定で「一覧」を取得している部分

- **API**: `GET /api/ingest/laws?date=yyyyMMdd`
- **処理**: 上記 e-Gov「更新法令一覧取得」を呼び、返ってきた `LawNameListInfo` を 1 件ずつ `NormSource` に upsert（externalId = LawId で重複判定）。
- **日付**: クエリで `date` を渡さない場合は**当日**の yyyyMMdd で取得。

いわゆる「日付指定で一覧（リスト）を取得」はここで実装済みです。「ZIP で取得」という表現は、e-Gov の一括ダウンロード（ZIP 配布）を指す場合は未実装です。

---

## 3. 履歴 API で「公示済み・施行前」の内容を取得しているか

**していません。**

- 現状は「更新法令一覧」のレスポンスに含まれる項目だけを DB に保存しています。
- 一覧には `EnforcementFlg`（0=施行済, 1=未施行）が含まれるため、**施行前かどうかはデータ上は判別可能**ですが、コードではこのフラグでフィルタはかけていません（一覧に載っているものはすべて取り込み）。
- **法令の条文・履歴**を取る e-Gov の「法令取得API」「条文内容取得API」等は呼んでおらず、**公示済み・施行前の「本文」を取得する処理は未実装**です。  
  （e-Gov 法令 API Version 1 は「施行中の現行法令」に限定されるため、施行前の条文を標準 API だけで取れるかは仕様確認が必要です。Version 2 や一括ダウンロードで対応している可能性があります。）

---

## 4. 取得内容を元にした「企業が何をすべきか」レポート

**生成 AI（OpenAI）を使った AI レポートが実装済みです（Issue #12）。**

レポートに相当する部分は次のとおりです。

1. **NormChange の作成**（`POST /api/analyze`）
   - `NormSource` を元に `NormChange` を 1 件作成。
   - `OPENAI_API_KEY` が設定されている場合は **OpenAI（gpt-4o-mini 等）で AI 判定**を行い、`riskSurvival`/`riskFinancial`/`riskCredit`/`riskOther` のリスク分類と `penaltyDetail`（リスクの解釈断定文）、`reportActionItems`（アクション一覧）、`reportDetailedRecommendations`（詳細推奨アクション＋根拠）を生成。
   - `OPENAI_API_KEY` が未設定の場合はキーワードフォールバック（`src/lib/analyze.ts`）で判定。フォールバック時は `penaltyDetail` を生成できないため `NormChange` を登録せず 503 を返す（Issue #40）。

2. **リスク分類（Issue #16/#19）**
   - 旧来の `obligationLevel`・`penaltyRisk` は削除済み（Issue #67/#68）。
   - 現在は `riskSurvival`（業務停止・免許取消等）/ `riskFinancial`（罰金・課徴金等）/ `riskCredit`（社名公表・勧告等）/ `riskOther`（手続き変更等）の 4 区分 Boolean。
   - `penaltyDetail` は survival/financial/credit のいずれかが true のときのみ設定される。riskOther のみなら null。

**現状の注意点**: e-Gov bulkdownload 経由で取得した場合のみ `rawText`・`rawTextPrev` が入る。それ以外（更新法令一覧のみ取得時）は `rawText = null` のため、AI への入力は法令名（title）のみとなる。

---

## 5. まとめ（現状 vs 想定フロー）

| 項目 | 想定（例） | 現状 |
|------|------------|------|
| 日付指定で取得 | 日付指定で ZIP 取得 | 日付指定で **更新法令一覧（XML）** を取得し DB に保存。ZIP は未使用。 |
| 履歴で公示済み施行前 | ZIP の ID を元に履歴 API で公示済み・施行前の内容取得 | 履歴 API は未使用。一覧のメタデータのみ保存。施行前の**本文**は未取得。 |
| 企業向けレポート | 取得内容から「何をすべきか」をレポート | **OpenAI で AI レポート生成済み（Issue #12）**。`OPENAI_API_KEY` が設定されていれば AI 判定、未設定ならキーワードフォールバック（失敗時は 503）。 |

このあと「ZIP 取得（bulkdownload）」「履歴で施行前本文取得」などで `rawText` を取得すると、AI 判定の精度が大幅に向上します。

---

## 6. v2 / bulkdownload を使う場合（検討用）

**法令API Version 2**

- **Swagger UI（公式）**: [https://laws.e-gov.go.jp/api/2/swagger-ui](https://laws.e-gov.go.jp/api/2/swagger-ui)  
  - 2025年3月19日リリース。OpenAPI 対応で取得可能なデータ・機能が拡充されている。

**日付指定で「更新された法令データ」を取得する（bulkdownload）**

- **XML一括ダウンロード（公式）**: [https://laws.e-gov.go.jp/bulkdownload/](https://laws.e-gov.go.jp/bulkdownload/)  
  - 「最近の更新法令データ」で、**日付（yyyyMMdd）を指定**してその日に更新された法令データを取得できる。
- **URL 形式（公式ページのリンクより）**  
  `https://laws.e-gov.go.jp/bulkdownload?file_section=3&update_date={yyyyMMdd}&only_xml_flag=true`  
  - `file_section=3`: 最近の更新法令データ  
  - `update_date`: 取得する法令データの日付（yyyyMMdd）  
  - `only_xml_flag=true`: XML のみ（画像・様式なし）  
- レスポンスは ZIP で配布される想定（中身は XML）。v1 の `updatelawlists` は単一 XML だったが、bulkdownload は ZIP の解凍・パースが必要になる可能性あり。

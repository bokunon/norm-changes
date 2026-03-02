# penaltyRisk（HIGH/MID/LOW/NONE）削除の調査・修正方針

## 1. 背景

- **penaltyRisk**（HIGH/MID/LOW/NONE）はリスクの「程度」を表すが、**もう使っていない**
- 欲しいのは **リスクの種類**（4種: 生存・金銭・信用・その他）と **リスクの詳細**（その中身の解釈断定文 = penaltyDetail）
- penaltyRisk が残っているため、リスクの種類とリスク詳細の不整合（例: リスク詳細「なし」なのにリスク種類「金銭」）が発生している

## 2. 現状の使用箇所

| 箇所 | 内容 |
|------|------|
| **prisma/schema.prisma** | `penaltyRisk String` カラム（NOT NULL） |
| **report-ai.ts** | `riskLevel` を AI に要求し、penaltyRisk にマッピング |
| **run-analyze.ts** | `detectPenaltyRisk` で初期値、`report.riskLevel` で上書き。DB に保存。penaltyDetail のフォールバック判定に使用 |
| **analyze.ts** | `detectPenaltyRisk` 関数（キーワードで HIGH/NONE 判定） |
| **API** (norm-changes, [id]) | レスポンスに `penaltyRisk` を含める |
| **詳細ページ** | `penaltyRisk === "NONE"` でリスク詳細「なし」、`penaltyRisk === "HIGH"` で赤表示 |
| **一覧ページ** | 型定義に `penaltyRisk` を含む（表示は未使用の可能性） |

## 3. 修正方針

### 3.1 リスクの種類とリスク詳細の連動

- **リスクの種類**: riskSurvival / riskFinancial / riskCredit / riskOther
- **リスク詳細**: penaltyDetail（解釈断定文）

**リスク詳細の表示ロジック**:
- survival / financial / credit のいずれかが true → penaltyDetail を表示。なければ「（AI が生成できませんでした）」等
- すべて other のみ → リスク詳細は「なし」または「手続き変更等」

**表示色**: リスクの種類の厳しさで決める（例: survival=amber, financial=red, credit=sky）

### 3.2 削除対象

| 対象 | 対応 |
|------|------|
| **NormChange.penaltyRisk** | カラム削除（マイグレーション） |
| **report-ai.ts の riskLevel** | プロンプト・出力から削除 |
| **run-analyze.ts の penaltyRisk** | 変数・保存・フォールバック判定を削除 |
| **analyze.ts の detectPenaltyRisk** | 関数削除 |
| **API の penaltyRisk** | レスポンスから削除 |
| **UI の penaltyRisk 参照** | リスクの種類・penaltyDetail ベースに変更 |

### 3.3 penaltyDetail のフォールバック（修正後）

**現状**: `penaltyRisk !== "NONE"` のとき「罰則・義務規定の可能性（要確認）」

**修正後**: riskSurvival / riskFinancial / riskCredit のいずれかが true なのに penaltyDetailText が null のとき
- フォールバック文言を変更（「要確認」は避ける）：例「（リスクの詳細はAIが生成できませんでした）」
- または null のまま表示側で「—」など

### 3.4 obligationLevel について

- schema のコメント: 「詳細画面では未表示」
- 一覧表示でも未使用の可能性
- 本チケットでは **penaltyRisk の削除に集中**。obligationLevel は別チケットで検討可。

## 4. 修正タスク一覧

1. [ ] **report-ai.ts**: riskLevel をプロンプト・出力から削除
2. [ ] **report-ai.ts**: penaltyDetailText のフォールバック条件をプロンプトで明確化（riskLevel が無いため、リスク種類ありのときは必ず記載する旨を追記）
3. [ ] **run-analyze.ts**: penaltyRisk を削除。penaltyDetail のフォールバックを riskSurvival/riskFinancial/riskCredit ベースに変更
4. [ ] **analyze.ts**: detectPenaltyRisk を削除
5. [ ] **Prisma**: penaltyRisk カラムを削除するマイグレーション作成
6. [ ] **API**: penaltyRisk をレスポンスから削除
7. [ ] **詳細ページ**: penaltyRisk 参照を削除。リスク詳細・表示色を risk 種類・penaltyDetail ベースに変更
8. [ ] **一覧ページ**: penaltyRisk を型・レスポンスから削除（該当あれば）
9. [ ] **risk-display.ts**: stripRiskLevelFromPenaltyDetail の LEVEL_PREFIX は、AI が誤って penaltyDetail に含める場合の除去用として残す（任意）

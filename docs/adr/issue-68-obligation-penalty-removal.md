# Issue #68: obligationLevel・penaltyRisk 削除と penaltyDetail の整理

**Issue #67 との整合性**: #67 で risk 種類（riskSurvival 等）の判定を改善。#68 の penaltyDetail は risk 種類に連動（survival/financial/credit のいずれかが true のときのみ保存）。

## 1. obligationLevel・penaltyRisk の使用状況

### obligationLevel
| 箇所 | 使用 |
|------|------|
| schema | あり（NOT NULL） |
| run-analyze | 保存 |
| API | レスポンスに含める |
| **UI 表示** | **使っていない**（型定義のみ、表示ロジックに未使用） |

### penaltyRisk
| 箇所 | 使用 |
|------|------|
| schema | あり（NOT NULL） |
| run-analyze | 保存 |
| API | レスポンスに含める |
| **UI 表示** | **詳細ページ**でリスク詳細の有無・表示色に使用 |

**結論**: obligationLevel は表示で使っていない。penaltyRisk は詳細ページの表示で使っているが、削除予定。

---

## 2. penaltyDetail のロジック（修正後）

- **riskSurvival / riskFinancial / riskCredit が全て false** → penaltyDetail は **null**
- その場合 **riskOther は true**（4種のうち必ず1つは true）
- penaltyDetail は nullable（String?）のまま。null で「なし」と表示する

**penaltyDetail が NOT NULL の場合のフォールバック**（現状は該当しないが）:
- riskOther のみで penaltyDetailText が null のとき、何を入れるか。
- ユーザー案: summary または reportSummary と同じ。
- ただし summary と penaltyDetail は意味が異なる（概要 vs リスクの解釈断定文）。riskOther のときは「手続き変更等」のような短い説明か null が妥当。

---

## 3. summary と reportSummary の違い・統合（完了）

| フィールド | 内容 |
|------------|------|
| **summary** | report.summary を strip したもの（対応重要度等を除去） |
| **reportSummary** | report.summary をそのまま（strip 前） |

**対応重要度をプロンプトから禁止したため、実質同じ値になっていた**。reportSummary を削除し summary に統合済み。

---

## 4. 削除タスク（obligationLevel・penaltyRisk）— 完了

1. [x] schema から obligationLevel, penaltyRisk を削除（マイグレーション）
2. [x] report-ai.ts から obligationLevel, riskLevel を削除
3. [x] run-analyze.ts から obligationLevel, penaltyRisk を削除（detectObligationLevel, detectPenaltyRisk の呼び出しも）
4. [x] analyze.ts から detectObligationLevel, detectPenaltyRisk を削除
5. [x] API から obligationLevel, penaltyRisk を削除
6. [x] UI から penaltyRisk 参照を削除（obligationLevel は型にあるが表示未使用のため型削除のみ）
7. [x] penaltyDetail: riskSurvival/riskFinancial/riskCredit のいずれかが true のときのみ penaltyDetailText を保存。riskOther のみのときは null。

### マイグレーション（2件・順番に適用）

```bash
npx prisma migrate deploy
```

1. `prisma/migrations/20260302000000_remove_obligation_penalty_risk_issue_68/migration.sql` — obligationLevel, penaltyRisk 削除
2. `prisma/migrations/20260302000001_remove_report_summary/migration.sql` — reportSummary 削除（summary に統合）

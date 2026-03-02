# Issue #67: リスク判定の改善 - 現状・修正後の流れと実装プラン

## 1. 現状の流れ・構成（実装済み）

```
[入力] rawText（改正後全文） + rawTextPrev（改正前全文、あれば）

  ↓

[1] AI レポート生成（report-ai.ts）※プロンプト修正済み
    - 「新たに発生したリスク」に (3)罰則の強化 (4)規定の明確化 を追加
    - rawTextPrev が無い場合: 全文のリスクをすべて新規として評価する旨を明確化

  ↓

[2] validateRiskTypeInText は廃止（偽陰性を招くため、AI の判定をそのまま採用）

  ↓

[3] primaryRiskType が other の場合
    - キーワードフォールバック: 条文にキーワードがあれば上書き

  ↓

[出力] riskSurvival / riskFinancial / riskCredit / riskOther
```

**penaltyDetail**: survival/financial/credit のいずれかが true のときのみ保存。other のみなら null（Issue #68 で整理済み）。

---

## 2. 修正後の流れ・構成（実装済み）

上記「1. 現状の流れ」と同一。プロンプト修正・validateRiskTypeInText 廃止・キーワードフォールバックを実施済み。

---

## 3. 現状と修正後の違い（一覧）— 実施済み

| 観点 | 修正前 | 修正後（実施済み） |
|------|--------|-------------------|
| **プロンプトの「新たに発生した」** | (1)(2) のみ | (3)罰則の強化 (4)規定の明確化 を追加 |
| **rawTextPrev が無い場合** | 曖昧 | 「全文に記載のリスクはすべて新規として評価」を明確化 |
| **validateRiskTypeInText** | 検証・false なら other に上書き | **廃止**（偽陰性を招くため） |
| **キーワードフォールバック** | なし | AI が other のとき常に適用 |

**Issue #68 との整合性**: penaltyRisk は削除済み。リスクの種類（riskSurvival 等）と penaltyDetail の連動は #68 で整理済み。

---

## 4. 実装プラン（タスク順）— 実施済み

### 4.1 プロンプト修正（report-ai.ts）※完了

- [x] primaryRiskType のプロンプトに「(3) 罰則の強化」「(4) 規定の明確化」を追加
- [x] rawTextPrev が無い場合の扱いを明確化

### 4.2 validateRiskTypeInText の見直し（report-ai.ts）※廃止

- [x] 偽陰性を招くため **廃止**。AI の判定をそのまま採用する。

### 4.3 キーワードフォールバック（run-analyze.ts）※完了

- [x] AI が other を返したとき、キーワードでフォールバック
- プロンプト修正の効果を見て、適用条件の絞り込みは検討可

### 4.4 洗替・検証

- [ ] 代表サンプルで再解析し、正しく判定されるか確認
- [ ] 必要に応じて reanalyze-risk-types.ts で既存データを洗替

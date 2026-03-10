# Issue #72: キーワードフォールバック調査結果（状態レポート）

## 1. 調査対象と条件

**条件**: `(riskSurvival OR riskFinancial OR riskCredit) = true` かつ `penaltyDetail = null`

**該当件数**: 11 件（本番 API から 2025-03-02 に取得）

---

## 2. あるべき結果 vs 実際の結果（全件）

| ID | 法令 | 実際のリスク | キーワード検出 | フォールバック適用 | 罰則文脈 | **あるべきリスク** | 判定 |
|----|------|-------------|---------------|-------------------|---------|-------------------|------|
| cmm8ofkop… | 国税徴収法 | survival | 罰金 | — | ○ | **financial** | AI が survival を返したが、条文に「罰金」あり。正しくは financial |
| cmm8ocksd… | 相続税法施行規則 | credit | 指名 | ○ | × | **other** | 「指名」は手続き規定（指名委員等）の文脈。フォールバック過検出 |
| cmm8ob45w… | 都市再開発法施行令 | financial | 納付金 | ○ | × | **other** | 「納付金」は負担金・清算金の納付等の手続き文脈。フォールバック過検出 |
| cmm8ob45w… | 税理士法施行規則 | survival | 登録の取消 | ○ | ○ | **survival** | フォールバック正。penaltyDetail を生成すべき |
| cmm8oa4jw… | 相続税法施行令 | survival | — | — | — | **survival** | AI が survival を返したが penaltyDetail を返さなかった（AI の漏れ） |
| （他） | 特定化学物質障害予防規則 | credit | 指名 | ○ | × | **other** | フォールバック過検出 |
| （他） | 外国倒産処理手続の承認援助に関する法律 | financial | 罰金 | ○ | ○ | **financial** | フォールバック正。penaltyDetail を生成すべき |
| （他） | 公認会計士法 | survival | 登録の取消 | ○ | ○ | **survival** | フォールバック正。penaltyDetail を生成すべき |
| （他） | 家事事件手続法 | financial | 罰金 | ○ | ○ | **financial** | フォールバック正。penaltyDetail を生成すべき |
| （他） | 商標法 | survival | 登録の取消 | ○ | ○ | **survival** | フォールバック正。penaltyDetail を生成すべき |
| （他） | 工業所有権に関する手続等の特例に関する法律 | survival | 登録の取消 | ○ | ○ | **survival** | フォールバック正。penaltyDetail を生成すべき |

---

## 3. サマリ（あるべき結果に基づく分類）

| 分類 | 件数 | あるべき結果 | 実際の結果 | 方針 |
|------|------|-------------|-----------|------|
| **フォールバック正** | 6 件 | survival/financial/credit | リスク種別は正しいが penaltyDetail が null | **フォールバック維持 + penaltyDetail を生成する** |
| **フォールバック誤** | 3 件 | other | survival/financial/credit（過検出） | フォールバックを却下するか、文脈チェックで厳格化 |
| **AI 由来（penaltyDetail 漏れ）** | 1 件 | survival/financial/credit | リスク種別は正しいが penaltyDetail が null | プロンプト改善（AI に penaltyDetail を必ず返させる） |
| **AI とフォールバック不一致** | 1 件 | financial | survival（AI の誤り） | 国税徴収法: 条文に「罰金」あり。正しくは financial |

---

## 4. 方針の結論

### フォールバックは「ある方が正しく判定できている」か

- **6 件**はフォールバックが正しく判定（税理士法施行規則、公認会計士法、商標法、工業所有権特例法、外国倒産処理手続法、家事事件手続法）
- **3 件**はフォールバックが過検出（都市再開発法施行令、相続税法施行規則、特定化学物質障害予防規則）

→ **フォールバックは「ある方が正しい」ケースが多いが、過検出もある。**

### 推奨方針

1. **フォールバックを維持する**
2. **フォールバック適用時に penaltyDetail を生成する**（テンプレート or 軽量 AI 呼び出し）
3. **過検出を減らすため、キーワードの文脈チェックを追加する**
   - 例: 「納付金」が「負担金の納付」「清算金の納付」等の手続き文脈なら financial にしない
   - 例: 「指名」が「指名委員」「指名手配」等の手続き文脈なら credit にしない

### 実装タスク

| タスク | 内容 |
|--------|------|
| 1 | フォールバック適用時、penaltyDetail が null なら生成する（テンプレート or AI） |
| 2 | 文脈チェックを追加し、「納付金」「指名」等の手続き規定での過検出を防ぐ |
| 3 | AI の penaltyDetail 漏れ対策（プロンプト強化） |
| 4 | 既存 11 件の洗替 |

---

## 5. 再実行方法

```bash
# API 経由（DATABASE_URL 不要）
npx tsx scripts/report-risk-detail-mismatch-api.ts

# DB 直接（DATABASE_URL 必要）
npx tsx scripts/report-risk-detail-mismatch.ts
```

-- リスクは一種類のみの原理原則: 既存データを正規化し、CHECK 制約を追加する。
-- 複数 true の場合は厳しさ順（生存 > 金銭 > 信用 > その他）で1つだけ残す。

-- 1. 複数 true の行を正規化（厳しさ順で1つのみ true に）
UPDATE "NormChange"
SET
  "riskFinancial" = "riskFinancial" AND NOT "riskSurvival",
  "riskCredit" = "riskCredit" AND NOT "riskSurvival" AND NOT "riskFinancial",
  "riskOther" = "riskOther" AND NOT "riskSurvival" AND NOT "riskFinancial" AND NOT "riskCredit";

-- 2. リスクは高々1つのみ true とする CHECK 制約
ALTER TABLE "NormChange"
ADD CONSTRAINT "NormChange_risk_single_only"
CHECK (
  (CASE WHEN "riskSurvival" THEN 1 ELSE 0 END +
   CASE WHEN "riskFinancial" THEN 1 ELSE 0 END +
   CASE WHEN "riskCredit" THEN 1 ELSE 0 END +
   CASE WHEN "riskOther" THEN 1 ELSE 0 END) <= 1
);

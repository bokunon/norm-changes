-- Issue #68: obligationLevel, penaltyRisk を削除
ALTER TABLE "NormChange" DROP COLUMN IF EXISTS "obligationLevel";
ALTER TABLE "NormChange" DROP COLUMN IF EXISTS "penaltyRisk";

-- reportSummary を summary に統合（同じ値のため冗長カラムを削除）
ALTER TABLE "NormChange" DROP COLUMN IF EXISTS "reportSummary";

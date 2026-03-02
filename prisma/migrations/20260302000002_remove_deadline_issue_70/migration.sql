-- Issue #70: deadline を削除（施行日と同一のため不要）
ALTER TABLE "NormChange" DROP COLUMN IF EXISTS "deadline";

-- Issue #50: NormSource に bulkdownloadDate を追加（ingest と analyze を日単位で連動させるため）
ALTER TABLE "NormSource" ADD COLUMN IF NOT EXISTS "bulkdownloadDate" TEXT;

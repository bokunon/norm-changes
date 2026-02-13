-- AlterTable: NormSource に e-Gov LawId 用の externalId を追加（重複登録防止）
ALTER TABLE "NormSource" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NormSource_externalId_key" ON "NormSource"("externalId");

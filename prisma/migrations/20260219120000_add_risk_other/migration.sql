-- AlterTable
ALTER TABLE "NormChange" ADD COLUMN "riskOther" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NotificationFilter" ADD COLUMN "riskOther" BOOLEAN NOT NULL DEFAULT false;

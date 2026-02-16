-- AlterTable
ALTER TABLE "NormChange" ADD COLUMN     "riskCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskFinancial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riskSurvival" BOOLEAN NOT NULL DEFAULT false;

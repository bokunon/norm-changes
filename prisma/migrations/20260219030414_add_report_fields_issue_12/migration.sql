-- AlterTable
ALTER TABLE "NormChange" ADD COLUMN     "reportActionItems" JSONB,
ADD COLUMN     "reportDetailedRecommendations" JSONB,
ADD COLUMN     "reportSummary" TEXT;

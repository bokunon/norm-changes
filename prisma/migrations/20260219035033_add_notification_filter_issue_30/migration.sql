-- CreateTable
CREATE TABLE "NotificationFilter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publishedFrom" TIMESTAMP(3),
    "publishedTo" TIMESTAMP(3),
    "riskSurvival" BOOLEAN NOT NULL DEFAULT false,
    "riskFinancial" BOOLEAN NOT NULL DEFAULT false,
    "riskCredit" BOOLEAN NOT NULL DEFAULT false,
    "normType" TEXT,
    "tagId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationFilter_createdAt_idx" ON "NotificationFilter"("createdAt");

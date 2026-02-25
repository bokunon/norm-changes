-- Issue #52: cron 実行ごとのログを永続化
CREATE TABLE "CronExecutionLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "result" TEXT NOT NULL,
    "processedDates" JSONB NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "CronExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronExecutionLog_startedAt_idx" ON "CronExecutionLog"("startedAt");

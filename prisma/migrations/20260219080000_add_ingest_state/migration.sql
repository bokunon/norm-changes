-- CreateTable
CREATE TABLE "IngestState" (
    "id" TEXT NOT NULL,
    "lastSuccessfulDate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestState_pkey" PRIMARY KEY ("id")
);

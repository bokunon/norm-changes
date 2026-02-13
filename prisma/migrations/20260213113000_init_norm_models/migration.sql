-- CreateTable
CREATE TABLE "NormSource" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "number" TEXT,
    "publisher" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "url" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NormSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormChange" (
    "id" TEXT NOT NULL,
    "normSourceId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "obligationLevel" TEXT NOT NULL,
    "penaltyRisk" TEXT NOT NULL,
    "penaltyDetail" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NormChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelJa" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormChangeTag" (
    "id" TEXT NOT NULL,
    "normChangeId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormChangeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "slackUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFilter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "includeTagIds" TEXT NOT NULL,
    "excludeTagIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_key_key" ON "Tag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NormChangeTag_normChangeId_tagId_key" ON "NormChangeTag"("normChangeId", "tagId");

-- CreateIndex
CREATE INDEX "NormChangeTag_normChangeId_idx" ON "NormChangeTag"("normChangeId");

-- CreateIndex
CREATE INDEX "NormChangeTag_tagId_idx" ON "NormChangeTag"("tagId");

-- CreateIndex
CREATE INDEX "UserFilter_userId_idx" ON "UserFilter"("userId");

-- AddForeignKey
ALTER TABLE "NormChange" ADD CONSTRAINT "NormChange_normSourceId_fkey" FOREIGN KEY ("normSourceId") REFERENCES "NormSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormChangeTag" ADD CONSTRAINT "NormChangeTag_normChangeId_fkey" FOREIGN KEY ("normChangeId") REFERENCES "NormChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormChangeTag" ADD CONSTRAINT "NormChangeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFilter" ADD CONSTRAINT "UserFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

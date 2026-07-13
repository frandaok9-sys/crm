-- CreateTable
CREATE TABLE "WebProspectCache" (
    "id" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "prospects" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebProspectCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebProspectCache_cityKey_key" ON "WebProspectCache"("cityKey");

-- CreateIndex
CREATE INDEX "WebProspectCache_fetchedAt_idx" ON "WebProspectCache"("fetchedAt");


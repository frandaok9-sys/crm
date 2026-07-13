-- CreateTable
CREATE TABLE "SavedTrip" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "totalKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedTrip_ownerId_createdAt_idx" ON "SavedTrip"("ownerId", "createdAt");


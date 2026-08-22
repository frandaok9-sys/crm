-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Board_ownerId_updatedAt_idx" ON "Board"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Board_isShared_updatedAt_idx" ON "Board"("isShared", "updatedAt");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


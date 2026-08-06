-- AlterTable
ALTER TABLE "ClientActivity" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "quoteId" TEXT;

-- CreateIndex
CREATE INDEX "ClientActivity_quoteId_doneAt_priority_idx" ON "ClientActivity"("quoteId", "doneAt", "priority");

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


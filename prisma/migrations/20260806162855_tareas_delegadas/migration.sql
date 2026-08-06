-- AlterTable
ALTER TABLE "ClientActivity" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "reply" TEXT;

-- CreateIndex
CREATE INDEX "ClientActivity_assignedToId_doneAt_dueAt_idx" ON "ClientActivity"("assignedToId", "doneAt", "dueAt");

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


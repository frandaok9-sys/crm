-- AlterTable
ALTER TABLE "LedgerMovement" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "paymentTermDays" INTEGER;

-- CreateIndex
CREATE INDEX "LedgerMovement_type_dueDate_idx" ON "LedgerMovement"("type", "dueDate");


-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Quote_needsReview_idx" ON "Quote"("needsReview");


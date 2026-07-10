-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "overallDiscount" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentTerms" TEXT;


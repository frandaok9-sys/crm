-- AlterTable
ALTER TABLE "QuotePhoto" ADD COLUMN     "section" TEXT;

-- CreateTable
CREATE TABLE "CompanyImage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyImage_pkey" PRIMARY KEY ("id")
);


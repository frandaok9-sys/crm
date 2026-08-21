-- CreateEnum
CREATE TYPE "StaffArea" AS ENUM ('MANAGEMENT', 'ADMINISTRATION', 'EMPLOYEE');

-- AlterTable (netAmount: los gastos ya cargados no tienen desglose → neto = total)
ALTER TABLE "Expense" ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "personId" TEXT;
UPDATE "Expense" SET "netAmount" = "amount" WHERE "netAmount" IS NULL;
ALTER TABLE "Expense" ALTER COLUMN "netAmount" SET NOT NULL;

-- CreateTable
CREATE TABLE "ExpenseTax" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ExpenseTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" "StaffArea" NOT NULL,
    "canSpend" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseTax_expenseId_idx" ON "ExpenseTax"("expenseId");

-- CreateIndex
CREATE INDEX "Person_area_isActive_idx" ON "Person"("area", "isActive");

-- CreateIndex
CREATE INDEX "Expense_personId_date_idx" ON "Expense"("personId", "date");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTax" ADD CONSTRAINT "ExpenseTax_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;


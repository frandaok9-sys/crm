-- CreateEnum
CREATE TYPE "FiscalKind" AS ENUM ('INVOICED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('FIXED', 'VARIABLE');

-- AlterTable
ALTER TABLE "LedgerMovement" ADD COLUMN     "fiscalKind" "FiscalKind" NOT NULL DEFAULT 'INVOICED';

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CostKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ARS',
    "categoryId" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "description" TEXT,
    "fiscalKind" "FiscalKind" NOT NULL DEFAULT 'INVOICED',
    "opportunityId" TEXT,
    "receipt" TEXT,
    "receiptType" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_isActive_position_idx" ON "ExpenseCategory"("isActive", "position");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_categoryId_date_idx" ON "Expense"("categoryId", "date");

-- CreateIndex
CREATE INDEX "Expense_opportunityId_idx" ON "Expense"("opportunityId");

-- CreateIndex
CREATE INDEX "Expense_createdById_date_idx" ON "Expense"("createdById", "date");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Categorías semilla (editables desde el módulo de Gastos). Escritas a mano.
INSERT INTO "ExpenseCategory" ("id", "name", "kind", "position") VALUES
  ('seedcat-alquiler',      'Alquiler',              'FIXED',    0),
  ('seedcat-sueldos',       'Sueldos',               'FIXED',    1),
  ('seedcat-servicios',     'Servicios',             'FIXED',    2),
  ('seedcat-seguros',       'Seguros',               'FIXED',    3),
  ('seedcat-materiales',    'Materiales',            'VARIABLE', 4),
  ('seedcat-combustible',   'Combustible',           'VARIABLE', 5),
  ('seedcat-mano-obra',     'Mano de obra eventual', 'VARIABLE', 6),
  ('seedcat-viaticos',      'Viáticos',              'VARIABLE', 7),
  ('seedcat-herramientas',  'Herramientas',          'VARIABLE', 8),
  ('seedcat-mantenimiento', 'Mantenimiento',         'VARIABLE', 9),
  ('seedcat-otros',         'Otros',                 'VARIABLE', 10)
ON CONFLICT ("name") DO NOTHING;

-- Backfill del permiso nuevo "expenses.manage" para los roles que lo traen
-- por defecto (los permisos por usuario solo se inicializan al asignar rol).
UPDATE "User"
SET "permissions" = array_append("permissions", 'expenses.manage')
WHERE "role" IN ('MANAGER', 'ADMINISTRATION')
  AND NOT ('expenses.manage' = ANY ("permissions"));


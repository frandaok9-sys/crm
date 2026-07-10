-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "afipEnv" TEXT NOT NULL DEFAULT 'homologacion',
ADD COLUMN     "afipPuntoVenta" INTEGER;

-- AlterTable
ALTER TABLE "LedgerMovement" ADD COLUMN     "cae" TEXT,
ADD COLUMN     "caeVto" TIMESTAMP(3),
ADD COLUMN     "cbteNro" INTEGER,
ADD COLUMN     "cbteTipo" INTEGER,
ADD COLUMN     "ptoVta" INTEGER;


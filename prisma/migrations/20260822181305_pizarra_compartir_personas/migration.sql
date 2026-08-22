-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "sharedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];


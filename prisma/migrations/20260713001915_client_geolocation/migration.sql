-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "geocodeStatus" "GeocodeStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6);


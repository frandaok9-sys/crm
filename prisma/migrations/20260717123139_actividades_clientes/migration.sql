-- CreateEnum
CREATE TYPE "ClientActivityType" AS ENUM ('CALL', 'VISIT', 'EMAIL', 'NOTE', 'TASK');

-- CreateTable
CREATE TABLE "ClientActivity" (
    "id" TEXT NOT NULL,
    "type" "ClientActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "clientId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientActivity_clientId_createdAt_idx" ON "ClientActivity"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientActivity_createdById_doneAt_dueAt_idx" ON "ClientActivity"("createdById", "doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "ClientActivity_opportunityId_idx" ON "ClientActivity"("opportunityId");

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


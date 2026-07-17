-- CreateIndex
CREATE INDEX "AuditLog_actorId_action_createdAt_idx" ON "AuditLog"("actorId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "Client_ownerId_legalName_idx" ON "Client"("ownerId", "legalName");

-- CreateIndex
CREATE INDEX "Client_latitude_longitude_idx" ON "Client"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "LedgerMovement_type_date_idx" ON "LedgerMovement"("type", "date");

-- CreateIndex
CREATE INDEX "Opportunity_stageId_position_idx" ON "Opportunity"("stageId", "position");

-- CreateIndex
CREATE INDEX "Quote_ownerId_createdAt_idx" ON "Quote"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_status_createdAt_idx" ON "Quote"("status", "createdAt");

-- Búsqueda por nombre (ILIKE '%texto%') con índice trigram: sin esto, cada
-- búsqueda de cliente escanea la tabla completa (lento con 2000+ clientes).
-- Escrito a mano porque Prisma no expresa índices GIN/pg_trgm en el schema.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Client_legalName_trgm_idx"
  ON "Client" USING GIN ("legalName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Client_tradeName_trgm_idx"
  ON "Client" USING GIN ("tradeName" gin_trgm_ops);


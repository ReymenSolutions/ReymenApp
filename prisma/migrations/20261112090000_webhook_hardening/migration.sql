-- Idempotencia por firma (el header de event-id no va firmado) y reclamo de eventos para recuperar PROCESSING huérfanos.
ALTER TABLE "WebhookEvent" ADD COLUMN "replayKey" TEXT;
ALTER TABLE "WebhookEvent" ADD COLUMN "claimedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "WebhookEvent_organizationId_source_replayKey_key" ON "WebhookEvent"("organizationId", "source", "replayKey");

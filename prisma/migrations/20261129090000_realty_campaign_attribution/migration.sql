-- Campañas con métricas automáticas: el perfil de búsqueda recuerda de qué campaña llegó (?c=<id> del enlace de la landing).
-- Solo agrega una columna; los conteos manuales de RealtyCampaign quedan sin uso.
ALTER TABLE "RealtyLeadProfile" ADD COLUMN "campaignId" TEXT;

CREATE INDEX "RealtyLeadProfile_campaignId_idx" ON "RealtyLeadProfile"("campaignId");

ALTER TABLE "RealtyLeadProfile"
  ADD CONSTRAINT "RealtyLeadProfile_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "RealtyCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

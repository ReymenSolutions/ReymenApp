-- Formulario «Quiero informes» de la landing de Real Estate: evento nuevo y, en el perfil de búsqueda, de qué
-- propiedad llegó y el consentimiento dado. Solo agrega (sin datos que migrar).
ALTER TYPE "RealtyEventType" ADD VALUE 'INQUIRY';

ALTER TABLE "RealtyLeadProfile"
  ADD COLUMN "sourcePropertyId" TEXT,
  ADD COLUMN "consentVersion" TEXT,
  ADD COLUMN "consentAt" TIMESTAMP(3);

CREATE INDEX "RealtyLeadProfile_sourcePropertyId_idx" ON "RealtyLeadProfile"("sourcePropertyId");

ALTER TABLE "RealtyLeadProfile"
  ADD CONSTRAINT "RealtyLeadProfile_sourcePropertyId_fkey"
  FOREIGN KEY ("sourcePropertyId") REFERENCES "RealtyProperty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

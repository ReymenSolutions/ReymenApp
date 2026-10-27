-- Perfil de búsqueda propuesto por el Agente IA desde una conversación. Solo agrega una tabla.
CREATE TYPE "RealtyProfileSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "RealtyProfileSuggestion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "RealtyProfileSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "operation" "RealtyOperation" NOT NULL,
  "propertyType" "RealtyPropertyType",
  "minBudget" DECIMAL(14,2),
  "maxBudget" DECIMAL(14,2) NOT NULL,
  "zoneNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "minBedrooms" INTEGER,
  "preferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "moveTimeline" TEXT,
  "reason" TEXT NOT NULL,
  "basedOnMessageId" TEXT,
  "profileId" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RealtyProfileSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RealtyProfileSuggestion_organizationId_leadId_status_idx" ON "RealtyProfileSuggestion"("organizationId", "leadId", "status");
CREATE INDEX "RealtyProfileSuggestion_leadId_createdAt_idx" ON "RealtyProfileSuggestion"("leadId", "createdAt");

ALTER TABLE "RealtyProfileSuggestion"
  ADD CONSTRAINT "RealtyProfileSuggestion_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

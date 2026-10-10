-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "phoneKey" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "phoneKey" TEXT,
ADD COLUMN "leadId" TEXT;

-- Llave de teléfono = últimos 10 dígitos (mínimo 7 dígitos), igual que src/lib/phone.ts
UPDATE "Lead"
SET "phoneKey" = right(regexp_replace("phone", '\D', '', 'g'), 10)
WHERE "phone" IS NOT NULL AND length(regexp_replace("phone", '\D', '', 'g')) >= 7;

UPDATE "Conversation"
SET "phoneKey" = right(regexp_replace("contactPhone", '\D', '', 'g'), 10)
WHERE "contactPhone" IS NOT NULL AND length(regexp_replace("contactPhone", '\D', '', 'g')) >= 7;

-- Enlazar las conversaciones existentes con el lead vivo más antiguo del mismo teléfono
UPDATE "Conversation" c
SET "leadId" = l."id"
FROM (
  SELECT DISTINCT ON ("organizationId", "phoneKey") "id", "organizationId", "phoneKey"
  FROM "Lead"
  WHERE "deletedAt" IS NULL AND "phoneKey" IS NOT NULL
  ORDER BY "organizationId", "phoneKey", "createdAt" ASC
) l
WHERE c."organizationId" = l."organizationId" AND c."phoneKey" = l."phoneKey";

-- CreateIndex
CREATE INDEX "Lead_organizationId_phoneKey_idx" ON "Lead"("organizationId", "phoneKey");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_phoneKey_idx" ON "Conversation"("organizationId", "phoneKey");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

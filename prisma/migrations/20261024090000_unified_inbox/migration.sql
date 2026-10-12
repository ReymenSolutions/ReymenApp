-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactHandle" TEXT,
ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastMessagePreview" TEXT,
ADD COLUMN     "lastMessageRole" "MessageRole",
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Conversation_organizationId_channel_lastMessageAt_idx" ON "Conversation"("organizationId", "channel", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_contactHandle_idx" ON "Conversation"("organizationId", "contactHandle");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_contactEmail_idx" ON "Conversation"("organizationId", "contactEmail");


-- Relleno de las conversaciones existentes: última actividad, vista previa y quién habló al final
-- (así "pendiente de respuesta" ya es correcto desde el primer día). Los no leídos arrancan en 0.
UPDATE "Conversation" c
SET "lastMessageAt" = m."createdAt",
    "lastMessagePreview" = LEFT(m."content", 140),
    "lastMessageRole" = m."role"
FROM (
    SELECT DISTINCT ON ("conversationId") "conversationId", "createdAt", "content", "role"
    FROM "Message"
    ORDER BY "conversationId", "createdAt" DESC
) m
WHERE m."conversationId" = c."id";

UPDATE "Conversation" SET "lastMessageAt" = "updatedAt" WHERE "lastMessagePreview" IS NULL;

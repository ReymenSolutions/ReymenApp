-- CreateEnum
CREATE TYPE "AgentMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO');

-- CreateTable
CREATE TABLE "AgentChannelSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "mode" "AgentMode" NOT NULL DEFAULT 'SUGGEST',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentChannelSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentChannelSetting_organizationId_channel_key" ON "AgentChannelSetting"("organizationId", "channel");

-- AddForeignKey
ALTER TABLE "AgentChannelSetting" ADD CONSTRAINT "AgentChannelSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quien tenía los borradores apagados queda con el agente apagado en todos los canales.
INSERT INTO "AgentChannelSetting" ("id", "organizationId", "channel", "mode", "updatedAt")
SELECT 'agm_' || md5(r."organizationId" || c.channel), r."organizationId", c.channel, 'OFF', CURRENT_TIMESTAMP
FROM "BusinessRulebook" r
CROSS JOIN (VALUES ('whatsapp'), ('instagram'), ('messenger'), ('webchat'), ('email'), ('enquiry')) AS c(channel)
WHERE r."draftsEnabled" = false;

-- AlterTable
ALTER TABLE "BusinessRulebook" DROP COLUMN "draftsEnabled";

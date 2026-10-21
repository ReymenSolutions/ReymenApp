-- CreateEnum
CREATE TYPE "ChannelConnectionState" AS ENUM ('UNVERIFIED', 'HEALTHY', 'DEGRADED', 'DISCONNECTED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "channelConnectionId" TEXT,
ADD COLUMN     "externalThreadId" TEXT;

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "externalAccountKey" TEXT NOT NULL,
    "credentialRef" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "state" "ChannelConnectionState" NOT NULL DEFAULT 'UNVERIFIED',
    "healthSequence" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" TIMESTAMP(3),
    "providerVerified" BOOLEAN NOT NULL DEFAULT false,
    "canReceive" BOOLEAN NOT NULL DEFAULT false,
    "canSend" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRouting" (
    "connectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentInstanceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelRouting_pkey" PRIMARY KEY ("connectionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_organizationId_id_key" ON "ChannelConnection"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_organizationId_channel_externalAccountKey_key" ON "ChannelConnection"("organizationId", "channel", "externalAccountKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRouting_organizationId_connectionId_key" ON "ChannelRouting"("organizationId", "connectionId");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_channelConnectionId_idx" ON "Conversation"("organizationId", "channelConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_channelConnectionId_externalThreadId_key" ON "Conversation"("channelConnectionId", "externalThreadId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_channelConnectionId_fkey" FOREIGN KEY ("organizationId", "channelConnectionId") REFERENCES "ChannelConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRouting" ADD CONSTRAINT "ChannelRouting_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "ChannelConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRouting" ADD CONSTRAINT "ChannelRouting_organizationId_agentInstanceId_fkey" FOREIGN KEY ("organizationId", "agentInstanceId") REFERENCES "AgentInstance"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Validate only new rows/nullable bindings; no legacy data is rewritten.
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_valid_versions" CHECK (version > 0 AND generation > 0 AND "healthSequence" >= 0);
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_known_channel" CHECK (channel IN ('whatsapp','instagram','messenger','webchat','email','enquiry'));
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channel_thread_pair" CHECK (("channelConnectionId" IS NULL) = ("externalThreadId" IS NULL));

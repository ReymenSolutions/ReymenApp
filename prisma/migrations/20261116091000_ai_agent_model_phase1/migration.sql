-- CreateEnum
CREATE TYPE "AgentInstanceStatus" AS ENUM ('LEGACY', 'PAUSED');

-- CreateEnum
CREATE TYPE "AgentExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_HANDOFF', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("key","version")
);

-- CreateTable
CREATE TABLE "AgentModelRollout" (
    "organizationId" TEXT NOT NULL,
    "shadowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentModelRollout_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "AgentInstance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "publicName" TEXT NOT NULL,
    "status" "AgentInstanceStatus" NOT NULL DEFAULT 'LEGACY',
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "legacyAssistantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfigRevision" (
    "organizationId" TEXT NOT NULL,
    "agentInstanceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentConfigRevision_pkey" PRIMARY KEY ("organizationId","agentInstanceId","version")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentInstanceId" TEXT NOT NULL,
    "configVersion" INTEGER NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "legacyJobId" TEXT NOT NULL,
    "status" "AgentExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecutionStep" (
    "organizationId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" "AgentExecutionStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentExecutionStep_pkey" PRIMARY KEY ("organizationId","executionId","stepKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentInstance_organizationId_id_key" ON "AgentInstance"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentInstance_organizationId_definitionKey_key" ON "AgentInstance"("organizationId", "definitionKey");

-- CreateIndex
CREATE INDEX "AgentExecution_organizationId_status_createdAt_idx" ON "AgentExecution"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_organizationId_id_key" ON "AgentExecution"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_organizationId_legacyJobId_key" ON "AgentExecution"("organizationId", "legacyJobId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_organizationId_conversationId_messageId_oper_key" ON "AgentExecution"("organizationId", "conversationId", "messageId", "operation");

-- AddForeignKey
ALTER TABLE "AgentModelRollout" ADD CONSTRAINT "AgentModelRollout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInstance" ADD CONSTRAINT "AgentInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInstance" ADD CONSTRAINT "AgentInstance_definitionKey_definitionVersion_fkey" FOREIGN KEY ("definitionKey", "definitionVersion") REFERENCES "AgentDefinition"("key", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConfigRevision" ADD CONSTRAINT "AgentConfigRevision_organizationId_agentInstanceId_fkey" FOREIGN KEY ("organizationId", "agentInstanceId") REFERENCES "AgentInstance"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_organizationId_agentInstanceId_configVersio_fkey" FOREIGN KEY ("organizationId", "agentInstanceId", "configVersion") REFERENCES "AgentConfigRevision"("organizationId", "agentInstanceId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecutionStep" ADD CONSTRAINT "AgentExecutionStep_organizationId_executionId_fkey" FOREIGN KEY ("organizationId", "executionId") REFERENCES "AgentExecution"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

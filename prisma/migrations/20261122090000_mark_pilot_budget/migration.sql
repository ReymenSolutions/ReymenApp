-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "pilotRootId" TEXT;

-- CreateTable
CREATE TABLE "AiPilotBudgetPolicy" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyMxn" DECIMAL(14,6) NOT NULL DEFAULT 500,
    "dailyMxn" DECIMAL(14,6) NOT NULL DEFAULT 25,
    "rootMxn" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPilotBudgetPolicy_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "AiPilotBudgetRoot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL DEFAULT 'private-webchat-pilot-v1',
    "agentKey" TEXT NOT NULL DEFAULT 'mark:pilot',
    "policyVersion" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "dayStart" TIMESTAMP(3) NOT NULL,
    "dayEnd" TIMESTAMP(3) NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "rootLimitMxn" DECIMAL(14,6) NOT NULL,
    "holdMxn" DECIMAL(14,6) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AiPilotBudgetRoot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiPilotBudgetRoot_organizationId_state_idx" ON "AiPilotBudgetRoot"("organizationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "AiPilotBudgetRoot_organizationId_id_key" ON "AiPilotBudgetRoot"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AiPilotBudgetRoot_organizationId_createdById_requestKey_key" ON "AiPilotBudgetRoot"("organizationId", "createdById", "requestKey");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_pilotRootId_fkey" FOREIGN KEY ("organizationId", "pilotRootId") REFERENCES "AiPilotBudgetRoot"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPilotBudgetPolicy" ADD CONSTRAINT "AiPilotBudgetPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPilotBudgetRoot" ADD CONSTRAINT "AiPilotBudgetRoot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


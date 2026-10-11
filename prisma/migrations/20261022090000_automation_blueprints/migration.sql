-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('SKIPPED', 'PENDING', 'DISPATCHED', 'SUCCEEDED', 'FAILED', 'DRY_RUN');

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "blueprintKey" TEXT,
ADD COLUMN     "blueprintVersion" INTEGER,
ADD COLUMN     "dryRun" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "lastStatus" "AutomationExecutionStatus",
ADD COLUMN     "trigger" TEXT;

-- CreateTable
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL,
    "skipReason" TEXT,
    "action" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationExecution_organizationId_createdAt_idx" ON "AutomationExecution"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_status_nextAttemptAt_idx" ON "AutomationExecution"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AutomationExecution_automationId_subjectId_idx" ON "AutomationExecution"("automationId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationExecution_automationId_domainEventId_key" ON "AutomationExecution"("automationId", "domainEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Automation_organizationId_blueprintKey_key" ON "Automation"("organizationId", "blueprintKey");

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_domainEventId_fkey" FOREIGN KEY ("domainEventId") REFERENCES "DomainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Organization" ADD COLUMN "customMaxAutomationRuns" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "maxAutomationRuns" INTEGER;
CREATE TABLE "AutomationUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "executionKey" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationUsage_state_check" CHECK ("state" IN ('RESERVED', 'SUCCEEDED', 'RELEASED'))
);
CREATE UNIQUE INDEX "AutomationUsage_organizationId_executionKey_key" ON "AutomationUsage"("organizationId", "executionKey");
CREATE INDEX "AutomationUsage_organizationId_period_state_idx" ON "AutomationUsage"("organizationId", "period", "state");

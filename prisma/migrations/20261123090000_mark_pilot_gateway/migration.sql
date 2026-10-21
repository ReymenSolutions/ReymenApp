-- Additive attribution only. No instance, policy, credentials or channel is enabled.
ALTER TABLE "AiPilotBudgetRoot" ADD COLUMN "agentInstanceId" TEXT, ADD COLUMN "configVersion" INTEGER;
ALTER TABLE "AiPilotBudgetRoot" ADD CONSTRAINT "pilot_root_config_pair" CHECK (
  ("agentInstanceId" IS NULL AND "configVersion" IS NULL) OR
  ("agentInstanceId" IS NOT NULL AND "configVersion" IS NOT NULL AND "configVersion" > 0)
);
ALTER TABLE "AiPilotBudgetRoot" ADD CONSTRAINT "AiPilotBudgetRoot_config_fkey"
  FOREIGN KEY ("organizationId", "agentInstanceId", "configVersion")
  REFERENCES "AgentConfigRevision"("organizationId", "agentInstanceId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiUsage" ADD COLUMN "pilotStep" INTEGER, ADD COLUMN "pilotEstimateMxn" DECIMAL(18,8), ADD COLUMN "pilotInputHash" TEXT;
ALTER TABLE "AiUsage" ADD CONSTRAINT "pilot_usage_step" CHECK (
  ("pilotStep" IS NULL AND "pilotEstimateMxn" IS NULL AND "pilotInputHash" IS NULL) OR
  ("pilotRootId" IS NOT NULL AND "pilotStep" IS NOT NULL AND "pilotStep" IN (1, 2) AND "pilotEstimateMxn" IS NOT NULL AND "pilotEstimateMxn" >= 0 AND "pilotInputHash" IS NOT NULL)
);
CREATE UNIQUE INDEX "AiUsage_organizationId_pilotRootId_pilotStep_key" ON "AiUsage"("organizationId", "pilotRootId", "pilotStep");
CREATE UNIQUE INDEX "pilot_provider_receipt_unique" ON "AiUsage"("provider", "externalId") WHERE "pilotStep" IS NOT NULL AND "externalId" IS NOT NULL;

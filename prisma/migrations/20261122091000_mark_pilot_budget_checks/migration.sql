-- Financial holds must never be negative or disappear while unresolved.
ALTER TABLE "AiPilotBudgetPolicy" ADD CONSTRAINT "pilot_policy_limits" CHECK (
  "dailyMxn" > 0 AND "dailyMxn" <= 25 AND
  "monthlyMxn" > 0 AND "monthlyMxn" <= 500 AND
  "rootMxn" > 0 AND "rootMxn" <= 1
);
ALTER TABLE "AiPilotBudgetRoot" ADD CONSTRAINT "pilot_root_hold" CHECK (
  "rootLimitMxn" > 0 AND "rootLimitMxn" <= 1 AND "holdMxn" >= 0 AND "holdMxn" <= "rootLimitMxn"
  AND (("state" = 'CLOSED' AND "holdMxn" = 0) OR ("state" IN ('RESERVED', 'IN_FLIGHT', 'UNCERTAIN') AND "holdMxn" > 0))
  AND "dayEnd" > "dayStart" AND "cycleEnd" > "cycleStart"
);
CREATE INDEX "AiUsage_organizationId_pilotRootId_idx" ON "AiUsage"("organizationId", "pilotRootId");

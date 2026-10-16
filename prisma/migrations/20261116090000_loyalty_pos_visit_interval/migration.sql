ALTER TABLE "Organization"
  ADD COLUMN "loyaltyVisitCooldownEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "loyaltyVisitCooldownMinutes" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_loyaltyVisitCooldownMinutes_check"
  CHECK ("loyaltyVisitCooldownMinutes" BETWEEN 1 AND 525600);

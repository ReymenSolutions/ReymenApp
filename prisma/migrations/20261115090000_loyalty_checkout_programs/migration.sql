ALTER TABLE "Customer" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY "organizationId" ORDER BY "createdAt" DESC, id DESC) AS n FROM "LoyaltyProgram") UPDATE "LoyaltyProgram" SET "isPrimary" = true FROM ranked WHERE "LoyaltyProgram".id = ranked.id AND ranked.n = 1;
CREATE UNIQUE INDEX "LoyaltyProgram_one_primary" ON "LoyaltyProgram" ("organizationId") WHERE "isPrimary";
ALTER TABLE "LoyaltyProgramVersion" ADD COLUMN "rewardValue" DECIMAL(12,2);
ALTER TABLE "LoyaltyReward" ADD COLUMN "rewardValue" DECIMAL(12,2);
ALTER TABLE "LoyaltyProgramVersion" ADD CONSTRAINT "loyalty_rule_value" CHECK ("rewardValue" IS NULL OR ("rewardValue" > 0 AND (("rewardType" = 'DISCOUNT_PERCENT' AND "rewardValue" <= 100) OR ("rewardType" = 'DISCOUNT_AMOUNT' AND "rewardValue" <= 100000))));
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "loyalty_reward_value" CHECK ("rewardValue" IS NULL OR ("rewardValue" > 0 AND (("rewardType" = 'DISCOUNT_PERCENT' AND "rewardValue" <= 100) OR ("rewardType" = 'DISCOUNT_AMOUNT' AND "rewardValue" <= 100000))));
CREATE TABLE "LoyaltyPosRedemption" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "orderId" TEXT NOT NULL, "rewardId" TEXT NOT NULL REFERENCES "LoyaltyReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "deviceId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "subtotalCents" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RESERVED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "loyalty_pos_amount" CHECK ("amountCents" > 0 AND "amountCents" <= "subtotalCents"),
 CONSTRAINT "loyalty_pos_state" CHECK ("status" IN ('RESERVED','COMMITTED','RELEASED','CANCELLED'))
);
CREATE UNIQUE INDEX "LoyaltyPosRedemption_organizationId_orderId_key" ON "LoyaltyPosRedemption"("organizationId","orderId");
CREATE INDEX "LoyaltyPosRedemption_rewardId_status_idx" ON "LoyaltyPosRedemption"("rewardId","status");
CREATE UNIQUE INDEX "loyalty_pos_reward_held" ON "LoyaltyPosRedemption"("rewardId") WHERE "status" IN ('RESERVED','COMMITTED');

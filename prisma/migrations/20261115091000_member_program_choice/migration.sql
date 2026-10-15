ALTER TABLE "LoyaltyMember" ADD COLUMN "isSelected" BOOLEAN NOT NULL DEFAULT true;
WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY "organizationId", "customerId" ORDER BY "createdAt" ASC, id ASC) AS n FROM "LoyaltyMember" WHERE "customerId" IS NOT NULL) UPDATE "LoyaltyMember" SET "isSelected" = false FROM ranked WHERE "LoyaltyMember".id = ranked.id AND ranked.n > 1;
CREATE UNIQUE INDEX "LoyaltyMember_one_selected" ON "LoyaltyMember"("organizationId","customerId") WHERE "isSelected" AND "customerId" IS NOT NULL;
ALTER TABLE "FoodSale" ADD COLUMN "isCancellation" BOOLEAN NOT NULL DEFAULT false;
UPDATE "FoodSale" SET "isCancellation" = true WHERE "grossAmount" < 0;

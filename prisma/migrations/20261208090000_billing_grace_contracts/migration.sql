ALTER TABLE "BillingNotice" ADD COLUMN "sentAt" TIMESTAMP(3), ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
UPDATE "BillingNotice" SET "sentAt" = "createdAt";
CREATE TABLE "StripeContractPrice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "stripePriceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StripeContractPrice_stripePriceId_key" ON "StripeContractPrice"("stripePriceId");
CREATE UNIQUE INDEX "StripeContractPrice_organizationId_amountCents_key" ON "StripeContractPrice"("organizationId", "amountCents");

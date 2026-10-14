-- AlterTable
ALTER TABLE "LoyaltyMember" ADD COLUMN     "deficitVisits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LoyaltyReward" ADD COLUMN     "missingVisits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoyaltyEventReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyEventReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyEventReceipt_organizationId_outcome_createdAt_idx" ON "LoyaltyEventReceipt"("organizationId", "outcome", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyEventReceipt_organizationId_eventId_key" ON "LoyaltyEventReceipt"("organizationId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyMember_programId_customerId_key" ON "LoyaltyMember"("programId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyVisit_organizationId_saleId_key" ON "LoyaltyVisit"("organizationId", "saleId");

-- AddForeignKey
ALTER TABLE "LoyaltyEventReceipt" ADD CONSTRAINT "LoyaltyEventReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

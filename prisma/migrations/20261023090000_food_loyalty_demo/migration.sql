-- REYMEN Loyalty (demo, módulo FOOD_OPS). Solo agrega tablas y tipos nuevos;
-- no cambia ninguna tabla existente.

-- CreateEnum
CREATE TYPE "LoyaltyProgramStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "LoyaltyProgramScope" AS ENUM ('ORGANIZATION', 'BRANCH');

-- CreateEnum
CREATE TYPE "LoyaltyRuleType" AS ENUM ('VISITS');

-- CreateEnum
CREATE TYPE "LoyaltyRewardType" AS ENUM ('FREE_ITEM', 'DISCOUNT_PERCENT', 'DISCOUNT_AMOUNT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LoyaltyVisitStatus" AS ENUM ('CONFIRMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "LoyaltyRewardStatus" AS ENUM ('AVAILABLE', 'REDEEMED');

-- CreateTable
CREATE TABLE "LoyaltyProgram" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" "LoyaltyProgramScope" NOT NULL DEFAULT 'ORGANIZATION',
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "LoyaltyProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "referenceLabel" TEXT,
    "referenceLat" DOUBLE PRECISION,
    "referenceLng" DOUBLE PRECISION,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyProgramVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "ruleType" "LoyaltyRuleType" NOT NULL DEFAULT 'VISITS',
    "visitGoal" INTEGER NOT NULL,
    "rewardType" "LoyaltyRewardType" NOT NULL DEFAULT 'FREE_ITEM',
    "rewardName" TEXT NOT NULL,
    "rewardDescription" TEXT,
    "rewardHeadline" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "whatsappKey" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "email" TEXT,
    "enrollmentBranchId" TEXT,
    "publicToken" TEXT NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "cycleVisits" INTEGER NOT NULL DEFAULT 0,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "visitsWithAmount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "firstVisitAt" TIMESTAMP(3),
    "lastVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "branchId" TEXT,
    "employeeUserId" TEXT,
    "saleId" TEXT,
    "saleAmount" DECIMAL(12,2),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "status" "LoyaltyVisitStatus" NOT NULL DEFAULT 'CONFIRMED',
    "programVersion" INTEGER NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "programVersion" INTEGER NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "visitGoal" INTEGER NOT NULL,
    "rewardType" "LoyaltyRewardType" NOT NULL,
    "rewardName" TEXT NOT NULL,
    "rewardDescription" TEXT,
    "status" "LoyaltyRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earnedVisitId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "redeemedBranchId" TEXT,
    "redeemedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyProgram_organizationId_status_idx" ON "LoyaltyProgram"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LoyaltyProgramVersion_organizationId_idx" ON "LoyaltyProgramVersion"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyProgramVersion_programId_version_key" ON "LoyaltyProgramVersion"("programId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyMember_publicToken_key" ON "LoyaltyMember"("publicToken");

-- CreateIndex
CREATE INDEX "LoyaltyMember_organizationId_postalCode_idx" ON "LoyaltyMember"("organizationId", "postalCode");

-- CreateIndex
CREATE INDEX "LoyaltyMember_organizationId_createdAt_idx" ON "LoyaltyMember"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyMember_organizationId_lastVisitAt_idx" ON "LoyaltyMember"("organizationId", "lastVisitAt");

-- CreateIndex
CREATE INDEX "LoyaltyMember_customerId_idx" ON "LoyaltyMember"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyMember_programId_whatsappKey_key" ON "LoyaltyMember"("programId", "whatsappKey");

-- CreateIndex
CREATE INDEX "LoyaltyVisit_organizationId_occurredAt_idx" ON "LoyaltyVisit"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "LoyaltyVisit_organizationId_branchId_occurredAt_idx" ON "LoyaltyVisit"("organizationId", "branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "LoyaltyVisit_memberId_occurredAt_idx" ON "LoyaltyVisit"("memberId", "occurredAt");

-- CreateIndex
CREATE INDEX "LoyaltyVisit_programId_occurredAt_idx" ON "LoyaltyVisit"("programId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyVisit_organizationId_idempotencyKey_key" ON "LoyaltyVisit"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyReward_earnedVisitId_key" ON "LoyaltyReward"("earnedVisitId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_organizationId_status_idx" ON "LoyaltyReward"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LoyaltyReward_organizationId_earnedAt_idx" ON "LoyaltyReward"("organizationId", "earnedAt");

-- CreateIndex
CREATE INDEX "LoyaltyReward_organizationId_redeemedAt_idx" ON "LoyaltyReward"("organizationId", "redeemedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyReward_memberId_cycleNumber_key" ON "LoyaltyReward"("memberId", "cycleNumber");

-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyProgramVersion" ADD CONSTRAINT "LoyaltyProgramVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyMember" ADD CONSTRAINT "LoyaltyMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyMember" ADD CONSTRAINT "LoyaltyMember_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyMember" ADD CONSTRAINT "LoyaltyMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyMember" ADD CONSTRAINT "LoyaltyMember_enrollmentBranchId_fkey" FOREIGN KEY ("enrollmentBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LoyaltyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_employeeUserId_fkey" FOREIGN KEY ("employeeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyVisit" ADD CONSTRAINT "LoyaltyVisit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "FoodSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LoyaltyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_earnedVisitId_fkey" FOREIGN KEY ("earnedVisitId") REFERENCES "LoyaltyVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_redeemedBranchId_fkey" FOREIGN KEY ("redeemedBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

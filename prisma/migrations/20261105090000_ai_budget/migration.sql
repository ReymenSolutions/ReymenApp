-- CreateEnum
CREATE TYPE "AiBudgetPolicy" AS ENUM ('BLOCK', 'DEGRADE');

-- CreateEnum
CREATE TYPE "AiBudgetAdjustmentType" AS ENUM ('EXTEND', 'RESET', 'TOPUP', 'CREDIT');

-- AlterEnum
ALTER TYPE "AiUsageStatus" ADD VALUE 'BLOCKED';

-- CreateTable
CREATE TABLE "AiBudgetSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monthlyBudgetMxn" DECIMAL(14,2),
    "policy" "AiBudgetPolicy" NOT NULL DEFAULT 'BLOCK',
    "fallbackProvider" TEXT,
    "fallbackModel" TEXT,
    "degradeCapMxn" DECIMAL(14,2),
    "policyAuthorizedById" TEXT,
    "policyAuthorizedAt" TIMESTAMP(3),
    "cycleAnchorAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBudgetSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudgetAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "type" "AiBudgetAdjustmentType" NOT NULL,
    "amountMxn" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "externalRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBudgetAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudgetReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "usageId" TEXT NOT NULL,
    "amountMxn" DECIMAL(14,6) NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBudgetReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudgetAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetSetting_organizationId_key" ON "AiBudgetSetting"("organizationId");

-- CreateIndex
CREATE INDEX "AiBudgetAdjustment_organizationId_cycleStart_idx" ON "AiBudgetAdjustment"("organizationId", "cycleStart");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetAdjustment_organizationId_externalRef_key" ON "AiBudgetAdjustment"("organizationId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetReservation_usageId_key" ON "AiBudgetReservation"("usageId");

-- CreateIndex
CREATE INDEX "AiBudgetReservation_organizationId_released_expiresAt_idx" ON "AiBudgetReservation"("organizationId", "released", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetAlert_organizationId_cycleStart_threshold_key" ON "AiBudgetAlert"("organizationId", "cycleStart", "threshold");

-- AddForeignKey
ALTER TABLE "AiBudgetSetting" ADD CONSTRAINT "AiBudgetSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetAdjustment" ADD CONSTRAINT "AiBudgetAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetAlert" ADD CONSTRAINT "AiBudgetAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


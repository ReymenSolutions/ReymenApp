-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUSED');

-- CreateEnum
CREATE TYPE "AiCostBasis" AS ENUM ('NO_RATE', 'ESTIMATED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "AiRate" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "inputPerMTok" DECIMAL(14,6) NOT NULL,
    "outputPerMTok" DECIMAL(14,6) NOT NULL,
    "cacheReadPerMTok" DECIMAL(14,6),
    "cacheWritePerMTok" DECIMAL(14,6),
    "reasoningPerMTok" DECIMAL(14,6),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentKey" TEXT,
    "conversationId" TEXT,
    "automationId" TEXT,
    "executionId" TEXT,
    "operation" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelServed" TEXT,
    "requestId" TEXT NOT NULL,
    "traceId" TEXT,
    "correlationId" TEXT,
    "externalId" TEXT,
    "status" "AiUsageStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "costBasis" "AiCostBasis" NOT NULL DEFAULT 'NO_RATE',
    "rateId" TEXT,
    "costOriginal" DECIMAL(18,8),
    "currencyOriginal" TEXT,
    "costMxn" DECIMAL(18,8),
    "fxRate" DECIMAL(12,6),
    "fxDate" TEXT,
    "fxSource" TEXT,
    "byok" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRate_provider_model_effectiveFrom_idx" ON "AiRate"("provider", "model", "effectiveFrom");

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_createdAt_idx" ON "AiUsage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_agentKey_createdAt_idx" ON "AiUsage"("organizationId", "agentKey", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_conversationId_idx" ON "AiUsage"("organizationId", "conversationId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_provider_model_createdAt_idx" ON "AiUsage"("provider", "model", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_organizationId_requestId_key" ON "AiUsage"("organizationId", "requestId");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "AiRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


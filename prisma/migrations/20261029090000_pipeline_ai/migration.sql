-- CreateEnum
CREATE TYPE "PipelineAiActionKind" AS ENUM ('CREATE_OPPORTUNITY', 'ADVANCE_STAGE', 'CLOSE_WON', 'CLOSE_LOST');

-- CreateEnum
CREATE TYPE "PipelineAiActionStatus" AS ENUM ('APPLIED', 'SUGGESTED', 'UNDONE', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "PipelineAiRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "basedOnMessageId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineAiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineAiAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "kind" "PipelineAiActionKind" NOT NULL,
    "status" "PipelineAiActionStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "opportunityTitle" TEXT NOT NULL,
    "fromStageId" TEXT,
    "fromStageName" TEXT,
    "toStageId" TEXT,
    "toStageName" TEXT,
    "leadStatusBefore" "LeadStatus",
    "leadStatusAfter" "LeadStatus",
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineAiAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineAiRun_organizationId_createdAt_idx" ON "PipelineAiRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineAiRun_leadId_createdAt_idx" ON "PipelineAiRun"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineAiRun_conversationId_basedOnMessageId_key" ON "PipelineAiRun"("conversationId", "basedOnMessageId");

-- CreateIndex
CREATE INDEX "PipelineAiAction_organizationId_status_createdAt_idx" ON "PipelineAiAction"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineAiAction_leadId_createdAt_idx" ON "PipelineAiAction"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineAiAction_opportunityId_idx" ON "PipelineAiAction"("opportunityId");

-- AddForeignKey
ALTER TABLE "PipelineAiRun" ADD CONSTRAINT "PipelineAiRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAiAction" ADD CONSTRAINT "PipelineAiAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineAiAction" ADD CONSTRAINT "PipelineAiAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineAiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;


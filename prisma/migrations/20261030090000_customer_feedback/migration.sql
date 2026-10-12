-- CreateEnum
CREATE TYPE "CustomerFeedbackStatus" AS ENUM ('REQUESTED', 'ANSWERED', 'OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "token" TEXT NOT NULL,
    "status" "CustomerFeedbackStatus" NOT NULL DEFAULT 'REQUESTED',
    "score" INTEGER,
    "comment" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFeedback_token_key" ON "CustomerFeedback"("token");

-- CreateIndex
CREATE INDEX "CustomerFeedback_organizationId_status_createdAt_idx" ON "CustomerFeedback"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFeedback_customerId_idx" ON "CustomerFeedback"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFeedback_organizationId_saleId_key" ON "CustomerFeedback"("organizationId", "saleId");

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


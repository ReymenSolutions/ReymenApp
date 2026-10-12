-- CreateEnum
CREATE TYPE "ReplyDraftStatus" AS ENUM ('GENERATING', 'READY', 'USED', 'DISMISSED', 'FAILED');

-- AlterTable
ALTER TABLE "BusinessRulebook" ADD COLUMN     "draftsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ReplyDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "basedOnMessageId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "ReplyDraftStatus" NOT NULL DEFAULT 'GENERATING',
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "error" TEXT,
    "finalContent" TEXT,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyDraft_organizationId_status_idx" ON "ReplyDraft"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyDraft_conversationId_basedOnMessageId_key" ON "ReplyDraft"("conversationId", "basedOnMessageId");

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


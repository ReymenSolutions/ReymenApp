-- CreateTable
CREATE TABLE "MarkChatPilot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkChatPilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkChatTurn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "basedOnMessageId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "knowledgeVersion" INTEGER,
    "sources" JSONB,
    "usageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkChatTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatPilot_conversationId_key" ON "MarkChatPilot"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatPilot_tokenHash_key" ON "MarkChatPilot"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatPilot_organizationId_conversationId_key" ON "MarkChatPilot"("organizationId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatPilot_organizationId_createdById_requestKey_key" ON "MarkChatPilot"("organizationId", "createdById", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatTurn_draftId_key" ON "MarkChatTurn"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatTurn_requestKey_key" ON "MarkChatTurn"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatTurn_conversationId_basedOnMessageId_key" ON "MarkChatTurn"("conversationId", "basedOnMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkChatTurn_organizationId_draftId_key" ON "MarkChatTurn"("organizationId", "draftId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_organizationId_id_key" ON "Conversation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_id_key" ON "Message"("conversationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyDraft_organizationId_id_key" ON "ReplyDraft"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "MarkChatPilot" ADD CONSTRAINT "MarkChatPilot_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "Conversation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkChatPilot" ADD CONSTRAINT "MarkChatPilot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkChatTurn" ADD CONSTRAINT "MarkChatTurn_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "MarkChatPilot"("organizationId", "conversationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkChatTurn" ADD CONSTRAINT "MarkChatTurn_conversationId_basedOnMessageId_fkey" FOREIGN KEY ("conversationId", "basedOnMessageId") REFERENCES "Message"("conversationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkChatTurn" ADD CONSTRAINT "MarkChatTurn_organizationId_draftId_fkey" FOREIGN KEY ("organizationId", "draftId") REFERENCES "ReplyDraft"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkChatTurn" ADD CONSTRAINT "MarkChatTurn_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


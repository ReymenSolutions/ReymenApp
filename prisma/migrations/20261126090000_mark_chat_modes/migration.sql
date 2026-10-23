-- AlterTable
ALTER TABLE "MarkChatTurn" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "humanRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "modeVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MarkChatSettings" (
    "organizationId" TEXT NOT NULL,
    "mode" "AgentMode" NOT NULL DEFAULT 'SUGGEST',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkChatSettings_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "MarkChatSettings" ADD CONSTRAINT "MarkChatSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkChatSettings" ADD CONSTRAINT "MarkChatSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


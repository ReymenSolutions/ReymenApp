-- AlterTable
ALTER TABLE "KnowledgeBase" ADD COLUMN     "knowledgeVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "KnowledgeRevision" (
    "organizationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[],
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,

    CONSTRAINT "KnowledgeRevision_pkey" PRIMARY KEY ("organizationId","articleId","version")
);

-- CreateTable
CREATE TABLE "KnowledgeGrant" (
    "organizationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "agentInstanceId" TEXT NOT NULL,
    "revisionVersion" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeGrant_pkey" PRIMARY KEY ("organizationId","articleId","agentInstanceId")
);

-- CreateTable
CREATE TABLE "KnowledgeAccessPolicy" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeAccessPolicy_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBase_organizationId_id_key" ON "KnowledgeBase"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "KnowledgeRevision" ADD CONSTRAINT "KnowledgeRevision_organizationId_articleId_fkey" FOREIGN KEY ("organizationId", "articleId") REFERENCES "KnowledgeBase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGrant" ADD CONSTRAINT "KnowledgeGrant_organizationId_articleId_fkey" FOREIGN KEY ("organizationId", "articleId") REFERENCES "KnowledgeBase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGrant" ADD CONSTRAINT "KnowledgeGrant_organizationId_articleId_revisionVersion_fkey" FOREIGN KEY ("organizationId", "articleId", "revisionVersion") REFERENCES "KnowledgeRevision"("organizationId", "articleId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGrant" ADD CONSTRAINT "KnowledgeGrant_organizationId_agentInstanceId_fkey" FOREIGN KEY ("organizationId", "agentInstanceId") REFERENCES "AgentInstance"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAccessPolicy" ADD CONSTRAINT "KnowledgeAccessPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_knowledgeVersion_check" CHECK ("knowledgeVersion" >= 0);
ALTER TABLE "KnowledgeRevision" ADD CONSTRAINT "KnowledgeRevision_version_check" CHECK ("version" > 0);
ALTER TABLE "KnowledgeGrant" ADD CONSTRAINT "KnowledgeGrant_version_check" CHECK ("version" > 0 AND "revisionVersion" > 0);
ALTER TABLE "KnowledgeAccessPolicy" ADD CONSTRAINT "KnowledgeAccessPolicy_version_check" CHECK ("version" > 0);

CREATE INDEX "KnowledgeGrant_organizationId_agentInstanceId_enabled_idx" ON "KnowledgeGrant"("organizationId", "agentInstanceId", "enabled");

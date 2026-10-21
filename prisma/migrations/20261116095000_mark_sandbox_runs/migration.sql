-- CreateTable
CREATE TABLE "AgentSandboxRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "fixtureVersion" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "status" "AgentExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "trace" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSandboxRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSandboxRun_organizationId_createdById_createdAt_idx" ON "AgentSandboxRun"("organizationId", "createdById", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSandboxRun_status_expiresAt_idx" ON "AgentSandboxRun"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSandboxRun_organizationId_createdById_requestKey_key" ON "AgentSandboxRun"("organizationId", "createdById", "requestKey");

-- AddForeignKey
ALTER TABLE "AgentSandboxRun" ADD CONSTRAINT "AgentSandboxRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

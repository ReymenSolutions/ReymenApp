-- CreateTable
CREATE TABLE "BusinessRulebook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT '',
    "greeting" TEXT NOT NULL DEFAULT '',
    "rules" TEXT NOT NULL DEFAULT '',
    "pricing" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRulebook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRulebook_organizationId_key" ON "BusinessRulebook"("organizationId");

-- AddForeignKey
ALTER TABLE "BusinessRulebook" ADD CONSTRAINT "BusinessRulebook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


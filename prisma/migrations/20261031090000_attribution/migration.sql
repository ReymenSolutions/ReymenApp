-- CreateTable
CREATE TABLE "AutomationTouch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "touchedAt" TIMESTAMP(3) NOT NULL,
    "conversionWindowDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationConversion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "touchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleAt" TIMESTAMP(3) NOT NULL,
    "attributedRevenue" DECIMAL(12,2) NOT NULL,
    "ruleVersion" INTEGER,
    "revertedAt" TIMESTAMP(3),
    "revertedBySaleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationTouch_executionId_key" ON "AutomationTouch"("executionId");

-- CreateIndex
CREATE INDEX "AutomationTouch_organizationId_customerId_touchedAt_idx" ON "AutomationTouch"("organizationId", "customerId", "touchedAt");

-- CreateIndex
CREATE INDEX "AutomationTouch_automationId_touchedAt_idx" ON "AutomationTouch"("automationId", "touchedAt");

-- CreateIndex
CREATE INDEX "AutomationConversion_automationId_saleAt_idx" ON "AutomationConversion"("automationId", "saleAt");

-- CreateIndex
CREATE INDEX "AutomationConversion_organizationId_saleAt_idx" ON "AutomationConversion"("organizationId", "saleAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationConversion_organizationId_saleId_key" ON "AutomationConversion"("organizationId", "saleId");

-- AddForeignKey
ALTER TABLE "AutomationTouch" ADD CONSTRAINT "AutomationTouch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationConversion" ADD CONSTRAINT "AutomationConversion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


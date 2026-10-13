-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "billingPeriodEnd" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amountMxn" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "externalRef" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingNotice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingPayment_organizationId_createdAt_idx" ON "BillingPayment"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_organizationId_externalRef_key" ON "BillingPayment"("organizationId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "BillingNotice_organizationId_periodEnd_kind_key" ON "BillingNotice"("organizationId", "periodEnd", "kind");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingNotice" ADD CONSTRAINT "BillingNotice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


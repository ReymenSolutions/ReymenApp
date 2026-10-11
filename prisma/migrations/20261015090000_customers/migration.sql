-- AlterTable
ALTER TABLE "FoodSale" ADD COLUMN     "cancelsSaleId" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(10,2),
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "externalOrderId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "name" TEXT,
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "consentTextVersion" TEXT,
    "consentAt" TIMESTAMP(3),
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "firstVisitAt" TIMESTAMP(3),
    "lastVisitAt" TIMESTAMP(3),
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_leadId_idx" ON "Customer"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_phoneKey_key" ON "Customer"("organizationId", "phoneKey");

-- CreateIndex
CREATE INDEX "FoodSale_organizationId_externalOrderId_idx" ON "FoodSale"("organizationId", "externalOrderId");

-- CreateIndex
CREATE INDEX "FoodSale_customerId_idx" ON "FoodSale"("customerId");

-- AddForeignKey
ALTER TABLE "FoodSale" ADD CONSTRAINT "FoodSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;


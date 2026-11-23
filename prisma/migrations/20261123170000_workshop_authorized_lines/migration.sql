-- AlterTable
ALTER TABLE "WorkshopOrderItem" ADD COLUMN     "requestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopOrderItem_organizationId_requestKey_key" ON "WorkshopOrderItem"("organizationId", "requestKey");

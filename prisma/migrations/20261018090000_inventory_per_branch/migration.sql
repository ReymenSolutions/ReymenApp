-- AlterEnum
ALTER TYPE "FoodInventoryMovementType" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "FoodInventoryMovement" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "FoodPurchase" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "FoodRecipeUsage" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "inventoryPerBranch" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BranchStock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "currentStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchStock_organizationId_idx" ON "BranchStock"("organizationId");

-- CreateIndex
CREATE INDEX "BranchStock_inventoryItemId_idx" ON "BranchStock"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchStock_branchId_inventoryItemId_key" ON "BranchStock"("branchId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "FoodInventoryMovement_organizationId_branchId_idx" ON "FoodInventoryMovement"("organizationId", "branchId");

-- AddForeignKey
ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStock" ADD CONSTRAINT "BranchStock_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "FoodInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


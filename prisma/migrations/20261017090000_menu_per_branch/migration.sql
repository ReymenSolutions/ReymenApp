-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "menuPerBranch" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BranchDish" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchVariantPrice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchVariantPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchDish_organizationId_idx" ON "BranchDish"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchDish_branchId_dishId_key" ON "BranchDish"("branchId", "dishId");

-- CreateIndex
CREATE INDEX "BranchVariantPrice_organizationId_idx" ON "BranchVariantPrice"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchVariantPrice_branchId_variantId_key" ON "BranchVariantPrice"("branchId", "variantId");

-- AddForeignKey
ALTER TABLE "BranchDish" ADD CONSTRAINT "BranchDish_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDish" ADD CONSTRAINT "BranchDish_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDish" ADD CONSTRAINT "BranchDish_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchVariantPrice" ADD CONSTRAINT "BranchVariantPrice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchVariantPrice" ADD CONSTRAINT "BranchVariantPrice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchVariantPrice" ADD CONSTRAINT "BranchVariantPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "FoodDishVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


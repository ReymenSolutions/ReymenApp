-- AlterTable
ALTER TABLE "FoodRecipeUsage" ADD COLUMN     "saleBranchId" TEXT;

-- CreateIndex
CREATE INDEX "FoodRecipeUsage_organizationId_saleBranchId_occurredAt_idx" ON "FoodRecipeUsage"("organizationId", "saleBranchId", "occurredAt");


-- Las ventas ya registradas con sucursal conservan su sucursal en el consumo de recetas.
UPDATE "FoodRecipeUsage" u SET "saleBranchId" = s."branchId" FROM "FoodSale" s WHERE u."foodSaleId" = s."id" AND s."branchId" IS NOT NULL;

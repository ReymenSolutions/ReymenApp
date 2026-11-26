-- CreateEnum
CREATE TYPE "WorkshopPhotoPhase" AS ENUM ('RECEPCION', 'PROCESO', 'ENTREGA');

-- AlterTable
ALTER TABLE "WorkshopQuote" ADD COLUMN     "enviadaEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkshopWorkOrder" ADD COLUMN     "kilometrajeEntrega" INTEGER,
ADD COLUMN     "refaccionesEntregadas" BOOLEAN;

-- AlterTable
ALTER TABLE "WorkshopPurchase" ADD COLUMN     "requestKey" TEXT;

-- AlterTable
ALTER TABLE "WorkshopCashMovement" ADD COLUMN     "requestKey" TEXT;

-- CreateTable
CREATE TABLE "WorkshopFolioCounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopFolioCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopPhoto" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "phase" "WorkshopPhotoPhase" NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopFolioCounter_organizationId_year_kind_key" ON "WorkshopFolioCounter"("organizationId", "year", "kind");

-- CreateIndex
CREATE INDEX "WorkshopPhoto_organizationId_workOrderId_phase_idx" ON "WorkshopPhoto"("organizationId", "workOrderId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopPurchase_organizationId_requestKey_key" ON "WorkshopPurchase"("organizationId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopCashMovement_organizationId_requestKey_key" ON "WorkshopCashMovement"("organizationId", "requestKey");

-- AddForeignKey
ALTER TABLE "WorkshopFolioCounter" ADD CONSTRAINT "WorkshopFolioCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPhoto" ADD CONSTRAINT "WorkshopPhoto_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPhoto" ADD CONSTRAINT "WorkshopPhoto_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkshopWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPhoto" ADD CONSTRAINT "WorkshopPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


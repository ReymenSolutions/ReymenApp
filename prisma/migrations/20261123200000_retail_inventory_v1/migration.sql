-- CreateEnum
CREATE TYPE "RetailLocationType" AS ENUM ('TIENDA', 'BODEGA', 'MAYOREO');

-- CreateEnum
CREATE TYPE "RetailLocationFormat" AS ENUM ('PREMIUM', 'OUTLET', 'HOGAR', 'BODEGA', 'MAYOREO');

-- CreateEnum
CREATE TYPE "RetailChannel" AS ENUM ('TIENDA', 'EN_LINEA', 'MAYOREO');

-- CreateEnum
CREATE TYPE "RetailItemStatus" AS ENUM ('DISPONIBLE', 'APARTADA', 'VENDIDA', 'EN_TRASLADO', 'MERMA');

-- CreateEnum
CREATE TYPE "RetailMovementType" AS ENUM ('ALTA', 'TRASLADO_SOLICITUD', 'TRASLADO_SALIDA', 'TRASLADO_RECEPCION', 'TRASLADO_CANCELACION', 'AJUSTE', 'MERMA');

-- CreateEnum
CREATE TYPE "RetailTransferStatus" AS ENUM ('SOLICITADO', 'EN_TRASLADO', 'RECIBIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "RetailLocationSettings" (
    "branchId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "RetailLocationType" NOT NULL,
    "format" "RetailLocationFormat" NOT NULL,
    "areaM2" DECIMAL(10,2),
    "address" TEXT,
    "whatsappPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailLocationSettings_pkey" PRIMARY KEY ("branchId")
);

-- CreateTable
CREATE TABLE "RetailItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "channel" "RetailChannel" NOT NULL DEFAULT 'TIENDA',
    "status" "RetailItemStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "brand" TEXT,
    "category" TEXT,
    "garmentType" TEXT,
    "size" TEXT,
    "color" TEXT,
    "style" TEXT,
    "cost" DECIMAL(12,2),
    "salePrice" DECIMAL(12,2) NOT NULL,
    "photoPath" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "RetailMovementType" NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "fromChannel" "RetailChannel",
    "toChannel" "RetailChannel",
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT,
    "transferId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" "RetailTransferStatus" NOT NULL DEFAULT 'SOLICITADO',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "requestedById" TEXT NOT NULL,
    "departedById" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailLocationSettings_organizationId_type_idx" ON "RetailLocationSettings"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "RetailLocationSettings_branchId_organizationId_key" ON "RetailLocationSettings"("branchId", "organizationId");

-- CreateIndex
CREATE INDEX "RetailItem_organizationId_locationId_status_idx" ON "RetailItem"("organizationId", "locationId", "status");

-- CreateIndex
CREATE INDEX "RetailItem_organizationId_channel_status_idx" ON "RetailItem"("organizationId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailItem_organizationId_code_key" ON "RetailItem"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RetailItem_id_organizationId_key" ON "RetailItem"("id", "organizationId");

-- CreateIndex
CREATE INDEX "RetailMovement_organizationId_itemId_occurredAt_idx" ON "RetailMovement"("organizationId", "itemId", "occurredAt");

-- CreateIndex
CREATE INDEX "RetailMovement_organizationId_type_occurredAt_idx" ON "RetailMovement"("organizationId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "RetailTransfer_organizationId_status_requestedAt_idx" ON "RetailTransfer"("organizationId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "RetailTransfer_organizationId_itemId_status_idx" ON "RetailTransfer"("organizationId", "itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailTransfer_id_organizationId_key" ON "RetailTransfer"("id", "organizationId");

-- A physical piece can have only one unfinished transfer, even under concurrent requests.
CREATE UNIQUE INDEX "RetailTransfer_one_open_per_item_idx" ON "RetailTransfer"("organizationId", "itemId")
WHERE "status" IN ('SOLICITADO', 'EN_TRASLADO');

-- CreateIndex
CREATE UNIQUE INDEX "Branch_id_organizationId_key" ON "Branch"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "RetailLocationSettings" ADD CONSTRAINT "RetailLocationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLocationSettings" ADD CONSTRAINT "RetailLocationSettings_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_locationId_organizationId_fkey" FOREIGN KEY ("locationId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMovement" ADD CONSTRAINT "RetailMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMovement" ADD CONSTRAINT "RetailMovement_itemId_organizationId_fkey" FOREIGN KEY ("itemId", "organizationId") REFERENCES "RetailItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMovement" ADD CONSTRAINT "RetailMovement_transferId_organizationId_fkey" FOREIGN KEY ("transferId", "organizationId") REFERENCES "RetailTransfer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_itemId_organizationId_fkey" FOREIGN KEY ("itemId", "organizationId") REFERENCES "RetailItem"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_fromLocationId_organizationId_fkey" FOREIGN KEY ("fromLocationId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_toLocationId_organizationId_fkey" FOREIGN KEY ("toLocationId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_nonnegative_money" CHECK ("salePrice" >= 0 AND ("cost" IS NULL OR "cost" >= 0));
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_distinct_locations" CHECK ("fromLocationId" <> "toLocationId");
ALTER TABLE "RetailMovement" ADD CONSTRAINT "RetailMovement_adjustment_reason" CHECK ("type" NOT IN ('AJUSTE', 'MERMA') OR NULLIF(BTRIM("reason"), '') IS NOT NULL);

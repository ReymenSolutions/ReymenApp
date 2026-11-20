-- CreateEnum
CREATE TYPE "WorkshopQuoteStatus" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "WorkshopOrderStatus" AS ENUM ('RECEPCION', 'DIAGNOSTICO', 'ESPERA_AUTORIZACION', 'EN_REPARACION', 'LISTA_PARA_ENTREGA', 'ENTREGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "WorkshopItemType" AS ENUM ('REFACCION', 'MANO_DE_OBRA', 'SERVICIO');

-- CreateEnum
CREATE TYPE "WorkshopInventoryMovementType" AS ENUM ('ENTRADA_COMPRA', 'SALIDA_ORDEN', 'DEVOLUCION', 'AJUSTE');

-- CreateEnum
CREATE TYPE "WorkshopCashType" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "WorkshopPaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA');

-- AlterEnum
ALTER TYPE "PlatformModule" ADD VALUE 'WORKSHOP';

-- CreateTable
CREATE TABLE "WorkshopSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vigenciaDias" INTEGER NOT NULL DEFAULT 15,
    "garantiaDias" INTEGER NOT NULL DEFAULT 90,
    "garantiaKm" INTEGER NOT NULL DEFAULT 5000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopVehicle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "placas" TEXT,
    "vin" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "anio" INTEGER,
    "version" TEXT,
    "motor" TEXT,
    "kilometrajeActual" INTEGER,
    "color" TEXT,
    "proximoServicioKm" INTEGER,
    "proximoServicioFecha" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopQuote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "folio" TEXT,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "estado" "WorkshopQuoteStatus" NOT NULL DEFAULT 'BORRADOR',
    "servicioTitulo" TEXT NOT NULL,
    "tiempoEstimado" TEXT,
    "vigenciaDias" INTEGER NOT NULL DEFAULT 15,
    "garantiaDias" INTEGER NOT NULL DEFAULT 90,
    "garantiaKm" INTEGER NOT NULL DEFAULT 5000,
    "subtotalNeto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costoTotalNeto" DECIMAL(12,2),
    "utilidadNeta" DECIMAL(12,2),
    "aprobadaEn" TIMESTAMP(3),
    "aprobadaVia" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopQuoteItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "partId" TEXT,
    "tipo" "WorkshopItemType" NOT NULL,
    "concepto" TEXT NOT NULL,
    "detalle" TEXT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "unidad" TEXT NOT NULL,
    "precioUnitarioNeto" DECIMAL(12,2) NOT NULL,
    "costoUnitarioNeto" DECIMAL(12,2),
    "importeNeto" DECIMAL(12,2) NOT NULL,
    "ivaImporte" DECIMAL(12,2) NOT NULL,
    "importeConIva" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopQuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopWorkOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "estado" "WorkshopOrderStatus" NOT NULL DEFAULT 'RECEPCION',
    "fallaReportada" TEXT,
    "diagnostico" TEXT,
    "kilometrajeIngreso" INTEGER NOT NULL,
    "nivelCombustible" TEXT,
    "checklistRecepcion" JSONB,
    "fotosRecepcion" JSONB,
    "fotosProceso" JSONB,
    "fotosEntrega" JSONB,
    "mecanicoAsignadoId" TEXT,
    "fechaPrometida" TIMESTAMP(3),
    "anticipo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "entregadaEn" TIMESTAMP(3),
    "garantiaDias" INTEGER NOT NULL DEFAULT 90,
    "garantiaKm" INTEGER NOT NULL DEFAULT 5000,
    "facturaSolicitada" BOOLEAN NOT NULL DEFAULT false,
    "creditoAutorizadoEn" TIMESTAMP(3),
    "creditoAutorizadoNota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopOrderItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "partId" TEXT,
    "tipo" "WorkshopItemType" NOT NULL,
    "concepto" TEXT NOT NULL,
    "detalle" TEXT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "unidad" TEXT NOT NULL,
    "precioUnitarioNeto" DECIMAL(12,2) NOT NULL,
    "costoUnitarioNeto" DECIMAL(12,2),
    "importeNeto" DECIMAL(12,2) NOT NULL,
    "ivaImporte" DECIMAL(12,2) NOT NULL,
    "importeConIva" DECIMAL(12,2) NOT NULL,
    "autorizadaEn" TIMESTAMP(3),
    "autorizadaVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopPart" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad" TEXT NOT NULL,
    "costoNeto" DECIMAL(12,2) NOT NULL,
    "precioVentaNeto" DECIMAL(12,2) NOT NULL,
    "stockMinimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "proveedorHabitual" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopInventoryMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "tipo" "WorkshopInventoryMovementType" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costoUnitarioNeto" DECIMAL(12,2) NOT NULL,
    "workOrderId" TEXT,
    "purchaseId" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopInventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopPurchase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "folioProveedor" TEXT,
    "subtotalNeto" DECIMAL(12,2) NOT NULL,
    "iva" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "workOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopPurchaseLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costoUnitarioNeto" DECIMAL(12,2) NOT NULL,
    "importeNeto" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopPurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopCashMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tipo" "WorkshopCashType" NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" "WorkshopPaymentMethod" NOT NULL,
    "workOrderId" TEXT,
    "purchaseId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPorId" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopSettings_organizationId_key" ON "WorkshopSettings"("organizationId");

-- CreateIndex
CREATE INDEX "WorkshopVehicle_organizationId_customerId_idx" ON "WorkshopVehicle"("organizationId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopVehicle_organizationId_placas_key" ON "WorkshopVehicle"("organizationId", "placas");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopVehicle_organizationId_vin_key" ON "WorkshopVehicle"("organizationId", "vin");

-- CreateIndex
CREATE INDEX "WorkshopQuote_organizationId_estado_idx" ON "WorkshopQuote"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "WorkshopQuote_organizationId_vehicleId_createdAt_idx" ON "WorkshopQuote"("organizationId", "vehicleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopQuote_organizationId_folio_key" ON "WorkshopQuote"("organizationId", "folio");

-- CreateIndex
CREATE INDEX "WorkshopQuoteItem_organizationId_quoteId_idx" ON "WorkshopQuoteItem"("organizationId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopWorkOrder_quoteId_key" ON "WorkshopWorkOrder"("quoteId");

-- CreateIndex
CREATE INDEX "WorkshopWorkOrder_organizationId_estado_idx" ON "WorkshopWorkOrder"("organizationId", "estado");

-- CreateIndex
CREATE INDEX "WorkshopWorkOrder_organizationId_vehicleId_createdAt_idx" ON "WorkshopWorkOrder"("organizationId", "vehicleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopWorkOrder_organizationId_folio_key" ON "WorkshopWorkOrder"("organizationId", "folio");

-- CreateIndex
CREATE INDEX "WorkshopOrderItem_organizationId_workOrderId_idx" ON "WorkshopOrderItem"("organizationId", "workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopPart_organizationId_sku_key" ON "WorkshopPart"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "WorkshopInventoryMovement_organizationId_partId_createdAt_idx" ON "WorkshopInventoryMovement"("organizationId", "partId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkshopInventoryMovement_organizationId_workOrderId_idx" ON "WorkshopInventoryMovement"("organizationId", "workOrderId");

-- CreateIndex
CREATE INDEX "WorkshopPurchase_organizationId_fecha_idx" ON "WorkshopPurchase"("organizationId", "fecha");

-- CreateIndex
CREATE INDEX "WorkshopPurchaseLine_organizationId_purchaseId_idx" ON "WorkshopPurchaseLine"("organizationId", "purchaseId");

-- CreateIndex
CREATE INDEX "WorkshopCashMovement_organizationId_fecha_idx" ON "WorkshopCashMovement"("organizationId", "fecha");

-- CreateIndex
CREATE INDEX "WorkshopCashMovement_organizationId_workOrderId_idx" ON "WorkshopCashMovement"("organizationId", "workOrderId");

-- AddForeignKey
ALTER TABLE "WorkshopSettings" ADD CONSTRAINT "WorkshopSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopVehicle" ADD CONSTRAINT "WorkshopVehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopVehicle" ADD CONSTRAINT "WorkshopVehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopQuote" ADD CONSTRAINT "WorkshopQuote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopQuote" ADD CONSTRAINT "WorkshopQuote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopQuote" ADD CONSTRAINT "WorkshopQuote_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "WorkshopVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopQuoteItem" ADD CONSTRAINT "WorkshopQuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "WorkshopQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopQuoteItem" ADD CONSTRAINT "WorkshopQuoteItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "WorkshopPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWorkOrder" ADD CONSTRAINT "WorkshopWorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWorkOrder" ADD CONSTRAINT "WorkshopWorkOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "WorkshopQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWorkOrder" ADD CONSTRAINT "WorkshopWorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWorkOrder" ADD CONSTRAINT "WorkshopWorkOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "WorkshopVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopWorkOrder" ADD CONSTRAINT "WorkshopWorkOrder_mecanicoAsignadoId_fkey" FOREIGN KEY ("mecanicoAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrderItem" ADD CONSTRAINT "WorkshopOrderItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkshopWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopOrderItem" ADD CONSTRAINT "WorkshopOrderItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "WorkshopPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPart" ADD CONSTRAINT "WorkshopPart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopInventoryMovement" ADD CONSTRAINT "WorkshopInventoryMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopInventoryMovement" ADD CONSTRAINT "WorkshopInventoryMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "WorkshopPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopInventoryMovement" ADD CONSTRAINT "WorkshopInventoryMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkshopWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopInventoryMovement" ADD CONSTRAINT "WorkshopInventoryMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "WorkshopPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPurchase" ADD CONSTRAINT "WorkshopPurchase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPurchase" ADD CONSTRAINT "WorkshopPurchase_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkshopWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPurchaseLine" ADD CONSTRAINT "WorkshopPurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "WorkshopPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPurchaseLine" ADD CONSTRAINT "WorkshopPurchaseLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "WorkshopPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCashMovement" ADD CONSTRAINT "WorkshopCashMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCashMovement" ADD CONSTRAINT "WorkshopCashMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkshopWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCashMovement" ADD CONSTRAINT "WorkshopCashMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "WorkshopPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCashMovement" ADD CONSTRAINT "WorkshopCashMovement_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

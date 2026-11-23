-- CreateTable
CREATE TABLE "WorkshopLeadRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "requestKey" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "placas" TEXT NOT NULL,
    "kilometraje" INTEGER NOT NULL,
    "servicioFalla" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopLeadRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopLeadRequest_organizationId_leadId_createdAt_idx" ON "WorkshopLeadRequest"("organizationId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkshopLeadRequest_organizationId_vehicleId_idx" ON "WorkshopLeadRequest"("organizationId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopLeadRequest_organizationId_requestKey_key" ON "WorkshopLeadRequest"("organizationId", "requestKey");

-- AddForeignKey
ALTER TABLE "WorkshopLeadRequest" ADD CONSTRAINT "WorkshopLeadRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopLeadRequest" ADD CONSTRAINT "WorkshopLeadRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopLeadRequest" ADD CONSTRAINT "WorkshopLeadRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "WorkshopVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

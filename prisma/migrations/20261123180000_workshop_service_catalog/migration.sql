-- CreateTable
CREATE TABLE "WorkshopService" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "costoNeto" DECIMAL(12,2),
    "precioVentaNeto" DECIMAL(12,2),
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopService_organizationId_active_idx" ON "WorkshopService"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopService_organizationId_nameEs_key" ON "WorkshopService"("organizationId", "nameEs");

-- AddForeignKey
ALTER TABLE "WorkshopService" ADD CONSTRAINT "WorkshopService_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

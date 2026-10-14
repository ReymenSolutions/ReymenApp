-- Lealtad: recompensa anulada (venta cancelada en el POS) y ubicación de cada punto de venta.
ALTER TYPE "LoyaltyRewardStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

-- CreateTable
CREATE TABLE "LoyaltyLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchKey" TEXT NOT NULL,
    "branchId" TEXT,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLocation_organizationId_branchKey_key" ON "LoyaltyLocation"("organizationId", "branchKey");

-- AddForeignKey
ALTER TABLE "LoyaltyLocation" ADD CONSTRAINT "LoyaltyLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLocation" ADD CONSTRAINT "LoyaltyLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

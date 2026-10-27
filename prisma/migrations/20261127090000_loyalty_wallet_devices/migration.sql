-- iPhones que agregaron una tarjeta de Lealtad a Apple Wallet (para avisarles cuando cambia el progreso).
CREATE TABLE "LoyaltyWalletDevice" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "deviceLibraryId" TEXT NOT NULL,
    "passTypeId" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyWalletDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyWalletDevice_deviceLibraryId_passTypeId_memberId_key" ON "LoyaltyWalletDevice"("deviceLibraryId", "passTypeId", "memberId");
CREATE INDEX "LoyaltyWalletDevice_memberId_idx" ON "LoyaltyWalletDevice"("memberId");

ALTER TABLE "LoyaltyWalletDevice" ADD CONSTRAINT "LoyaltyWalletDevice_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LoyaltyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

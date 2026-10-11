-- CreateTable
CREATE TABLE "FoodKitchenTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "externalOrderId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "tableName" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "station" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3) NOT NULL,
    "prepSeconds" INTEGER NOT NULL,
    "deviceCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodKitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodShiftClose" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "externalSessionId" TEXT NOT NULL,
    "shiftNumber" INTEGER NOT NULL,
    "deviceCode" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "openedByName" TEXT NOT NULL,
    "closedByName" TEXT NOT NULL,
    "openingFloat" DECIMAL(12,2) NOT NULL,
    "expected" DECIMAL(12,2) NOT NULL,
    "counted" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "salesTotal" DECIMAL(12,2) NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "tips" DECIMAL(12,2) NOT NULL,
    "cancelledTotal" DECIMAL(12,2) NOT NULL,
    "cancelledCount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodShiftClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodKitchenTicket_organizationId_readyAt_idx" ON "FoodKitchenTicket"("organizationId", "readyAt");

-- CreateIndex
CREATE INDEX "FoodKitchenTicket_organizationId_branchId_readyAt_idx" ON "FoodKitchenTicket"("organizationId", "branchId", "readyAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodKitchenTicket_organizationId_externalItemId_key" ON "FoodKitchenTicket"("organizationId", "externalItemId");

-- CreateIndex
CREATE INDEX "FoodShiftClose_organizationId_closedAt_idx" ON "FoodShiftClose"("organizationId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodShiftClose_organizationId_externalSessionId_key" ON "FoodShiftClose"("organizationId", "externalSessionId");

-- AddForeignKey
ALTER TABLE "FoodKitchenTicket" ADD CONSTRAINT "FoodKitchenTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodShiftClose" ADD CONSTRAINT "FoodShiftClose_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


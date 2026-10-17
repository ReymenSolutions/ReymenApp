-- REYMEN Ops Realty v1: módulo, enums y tablas realty_* (solo tablas nuevas;
-- referencia Lead, Appointment, Branch y User sin modificarlos).

ALTER TYPE "PlatformModule" ADD VALUE IF NOT EXISTS 'REALTY';

-- CreateEnum
CREATE TYPE "RealtyOperation" AS ENUM ('SALE', 'RENT');
CREATE TYPE "RealtyPropertyType" AS ENUM ('HOUSE', 'APARTMENT', 'LAND', 'OFFICE', 'COMMERCIAL', 'WAREHOUSE', 'OTHER');
CREATE TYPE "RealtyPropertyStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'NEGOTIATION', 'SOLD', 'RENTED', 'INACTIVE');
CREATE TYPE "RealtyEventType" AS ENUM ('VIEW', 'WHATSAPP_CLICK', 'SCHEDULE_CLICK', 'SHARE_CLICK');
CREATE TYPE "RealtyCampaignChannel" AS ENUM ('META', 'INSTAGRAM', 'GOOGLE', 'SMARTCARD', 'WHATSAPP', 'PORTAL', 'REFERRAL', 'OTHER');
CREATE TYPE "RealtyCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateTable
CREATE TABLE "RealtySettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publicWhatsapp" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'MXN',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealtySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyZone" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtyZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyLeadProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "branchId" TEXT,
    "advisorUserId" TEXT,
    "operation" "RealtyOperation" NOT NULL,
    "propertyType" "RealtyPropertyType",
    "minBudget" DECIMAL(14,2),
    "maxBudget" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "minBedrooms" INTEGER,
    "minBathrooms" DOUBLE PRECISION,
    "minArea" DOUBLE PRECISION,
    "moveTimeline" TEXT,
    "financingNeeded" BOOLEAN,
    "preferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealtyLeadProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyLeadZone" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "RealtyLeadZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyProperty" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "advisorUserId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "operation" "RealtyOperation" NOT NULL,
    "propertyType" "RealtyPropertyType" NOT NULL,
    "status" "RealtyPropertyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "zoneId" TEXT NOT NULL,
    "neighborhood" TEXT,
    "addressLine" TEXT,
    "showExactLocation" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" DOUBLE PRECISION,
    "parkingSpaces" INTEGER,
    "constructionArea" DOUBLE PRECISION,
    "landArea" DOUBLE PRECISION,
    "ageYears" INTEGER,
    "furnished" BOOLEAN,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactWhatsapp" TEXT,
    "publishedAt" TIMESTAMP(3),
    "availableSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealtyProperty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyPropertyMedia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtyPropertyMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyPropertyStatusHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "fromStatus" "RealtyPropertyStatus",
    "toStatus" "RealtyPropertyStatus" NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "RealtyPropertyStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyPropertyEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" "RealtyEventType" NOT NULL,
    "source" TEXT,
    "campaignId" TEXT,
    "visitorHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtyPropertyEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyMatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "budgetScore" INTEGER NOT NULL,
    "zoneScore" INTEGER NOT NULL,
    "typeScore" INTEGER NOT NULL,
    "roomsScore" INTEGER NOT NULL,
    "areaScore" INTEGER NOT NULL,
    "extrasScore" INTEGER NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtyMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT,
    "name" TEXT NOT NULL,
    "channel" "RealtyCampaignChannel" NOT NULL,
    "spend" DECIMAL(14,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "leadsCount" INTEGER NOT NULL DEFAULT 0,
    "visitsCount" INTEGER NOT NULL DEFAULT 0,
    "closingsCount" INTEGER NOT NULL DEFAULT 0,
    "attributedRevenue" DECIMAL(14,2),
    "status" "RealtyCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealtyCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyPropertyVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "profileId" TEXT,
    "advisorUserId" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtyPropertyVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealtyClosing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "profileId" TEXT,
    "advisorUserId" TEXT,
    "opportunityId" TEXT,
    "operation" "RealtyOperation" NOT NULL,
    "finalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "commissionAmount" DECIMAL(14,2),
    "closedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtyClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RealtySettings_organizationId_key" ON "RealtySettings"("organizationId");
CREATE UNIQUE INDEX "RealtyZone_organizationId_key_key" ON "RealtyZone"("organizationId", "key");
CREATE INDEX "RealtyLeadProfile_organizationId_active_idx" ON "RealtyLeadProfile"("organizationId", "active");
CREATE INDEX "RealtyLeadProfile_organizationId_createdAt_idx" ON "RealtyLeadProfile"("organizationId", "createdAt");
CREATE INDEX "RealtyLeadProfile_leadId_idx" ON "RealtyLeadProfile"("leadId");
CREATE UNIQUE INDEX "RealtyLeadZone_profileId_zoneId_key" ON "RealtyLeadZone"("profileId", "zoneId");
CREATE INDEX "RealtyLeadZone_organizationId_zoneId_idx" ON "RealtyLeadZone"("organizationId", "zoneId");
CREATE UNIQUE INDEX "RealtyProperty_slug_key" ON "RealtyProperty"("slug");
CREATE INDEX "RealtyProperty_organizationId_status_idx" ON "RealtyProperty"("organizationId", "status");
CREATE INDEX "RealtyProperty_organizationId_zoneId_idx" ON "RealtyProperty"("organizationId", "zoneId");
CREATE INDEX "RealtyProperty_organizationId_availableSince_idx" ON "RealtyProperty"("organizationId", "availableSince");
CREATE INDEX "RealtyPropertyMedia_propertyId_sortOrder_idx" ON "RealtyPropertyMedia"("propertyId", "sortOrder");
CREATE INDEX "RealtyPropertyStatusHistory_propertyId_changedAt_idx" ON "RealtyPropertyStatusHistory"("propertyId", "changedAt");
CREATE INDEX "RealtyPropertyEvent_organizationId_occurredAt_idx" ON "RealtyPropertyEvent"("organizationId", "occurredAt");
CREATE INDEX "RealtyPropertyEvent_propertyId_type_occurredAt_idx" ON "RealtyPropertyEvent"("propertyId", "type", "occurredAt");
CREATE UNIQUE INDEX "RealtyMatch_profileId_propertyId_key" ON "RealtyMatch"("profileId", "propertyId");
CREATE INDEX "RealtyMatch_organizationId_totalScore_idx" ON "RealtyMatch"("organizationId", "totalScore");
CREATE INDEX "RealtyMatch_propertyId_totalScore_idx" ON "RealtyMatch"("propertyId", "totalScore");
CREATE INDEX "RealtyCampaign_organizationId_startDate_idx" ON "RealtyCampaign"("organizationId", "startDate");
CREATE UNIQUE INDEX "RealtyPropertyVisit_appointmentId_key" ON "RealtyPropertyVisit"("appointmentId");
CREATE INDEX "RealtyPropertyVisit_organizationId_propertyId_idx" ON "RealtyPropertyVisit"("organizationId", "propertyId");
CREATE INDEX "RealtyClosing_organizationId_closedAt_idx" ON "RealtyClosing"("organizationId", "closedAt");

-- AddForeignKey
ALTER TABLE "RealtySettings" ADD CONSTRAINT "RealtySettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyZone" ADD CONSTRAINT "RealtyZone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyLeadProfile" ADD CONSTRAINT "RealtyLeadProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyLeadProfile" ADD CONSTRAINT "RealtyLeadProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtyLeadProfile" ADD CONSTRAINT "RealtyLeadProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtyLeadProfile" ADD CONSTRAINT "RealtyLeadProfile_advisorUserId_fkey" FOREIGN KEY ("advisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtyLeadZone" ADD CONSTRAINT "RealtyLeadZone_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RealtyLeadProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyLeadZone" ADD CONSTRAINT "RealtyLeadZone_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "RealtyZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyProperty" ADD CONSTRAINT "RealtyProperty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyProperty" ADD CONSTRAINT "RealtyProperty_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtyProperty" ADD CONSTRAINT "RealtyProperty_advisorUserId_fkey" FOREIGN KEY ("advisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtyProperty" ADD CONSTRAINT "RealtyProperty_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "RealtyZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RealtyPropertyMedia" ADD CONSTRAINT "RealtyPropertyMedia_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RealtyProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyPropertyStatusHistory" ADD CONSTRAINT "RealtyPropertyStatusHistory_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RealtyProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyPropertyEvent" ADD CONSTRAINT "RealtyPropertyEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RealtyProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyMatch" ADD CONSTRAINT "RealtyMatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RealtyLeadProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyMatch" ADD CONSTRAINT "RealtyMatch_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RealtyProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyCampaign" ADD CONSTRAINT "RealtyCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyCampaign" ADD CONSTRAINT "RealtyCampaign_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RealtyProperty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtyPropertyVisit" ADD CONSTRAINT "RealtyPropertyVisit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyPropertyVisit" ADD CONSTRAINT "RealtyPropertyVisit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RealtyProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyPropertyVisit" ADD CONSTRAINT "RealtyPropertyVisit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RealtyLeadProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtyClosing" ADD CONSTRAINT "RealtyClosing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtyClosing" ADD CONSTRAINT "RealtyClosing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "RealtyProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RealtyClosing" ADD CONSTRAINT "RealtyClosing_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RealtyLeadProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

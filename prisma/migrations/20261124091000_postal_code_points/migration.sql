-- Centro aproximado de cada código postal (caché compartida) para los mapas por CP.
CREATE TABLE "PostalCodePoint" (
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "precision" TEXT,
    "lastTriedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostalCodePoint_pkey" PRIMARY KEY ("postalCode")
);

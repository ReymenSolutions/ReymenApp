-- REYMEN Ops Realty: dirección estructurada por código postal (SEPOMEX).
-- Solo agrega columnas opcionales; no cambia ni borra datos.
ALTER TABLE "RealtyZone" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "RealtyProperty" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "RealtyProperty" ADD COLUMN "municipality" TEXT;
ALTER TABLE "RealtyProperty" ADD COLUMN "state" TEXT;

-- Diseño de la tarjeta de lealtad que ve el cliente: color, color de acento e ícono.
-- Solo agrega columnas opcionales (null = el diseño de siempre).
ALTER TABLE "LoyaltyProgram" ADD COLUMN "cardColor" TEXT;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "cardAccent" TEXT;
ALTER TABLE "LoyaltyProgram" ADD COLUMN "cardIcon" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "accent" TEXT NOT NULL DEFAULT 'slate';

-- Colores iniciales de los tres planes.
UPDATE "Plan" SET "accent" = 'blue' WHERE "key" = 'professional';
UPDATE "Plan" SET "accent" = 'amber' WHERE "key" = 'business';

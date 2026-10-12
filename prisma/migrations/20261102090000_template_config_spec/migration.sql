-- La configuración vive en un solo lugar: Automation.config. Se copia lo que solo estuviera en la instalación
-- (applyTemplateInstall escribía en ambos) y se retira la columna duplicada.
UPDATE "Automation" a
SET "config" = ti."config"
FROM "TemplateInstallation" ti
WHERE ti."automationId" = a."id" AND a."config" IS NULL AND ti."config" IS NOT NULL;

-- AlterTable
ALTER TABLE "TemplateInstallation" DROP COLUMN "config";

-- AlterTable
ALTER TABLE "TemplateVersion" ADD COLUMN     "configSpec" JSONB;

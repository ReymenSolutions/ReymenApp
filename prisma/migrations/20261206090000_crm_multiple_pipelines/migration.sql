-- Varios embudos (pipelines) por negocio. Cada organización que ya tenía etapas recibe un embudo principal «Ventas»
-- con todas ellas; nada cambia para el usuario hasta que cree otro embudo.

CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pipeline_organizationId_order_idx" ON "Pipeline"("organizationId", "order");
-- Un solo embudo principal por organización.
CREATE UNIQUE INDEX "Pipeline_organizationId_default_key" ON "Pipeline"("organizationId") WHERE "isDefault";

ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Pipeline" ("id", "organizationId", "name", "order", "isDefault", "createdAt", "updatedAt")
SELECT 'pl' || substr(md5(random()::text || s."organizationId"), 1, 23), s."organizationId", 'Ventas', 0, true, NOW(), NOW()
FROM (SELECT DISTINCT "organizationId" FROM "PipelineStage") s;

ALTER TABLE "PipelineStage" ADD COLUMN "pipelineId" TEXT;
UPDATE "PipelineStage" ps SET "pipelineId" = p."id" FROM "Pipeline" p WHERE p."organizationId" = ps."organizationId" AND p."isDefault";
ALTER TABLE "PipelineStage" ALTER COLUMN "pipelineId" SET NOT NULL;

DROP INDEX "PipelineStage_organizationId_order_key";
CREATE UNIQUE INDEX "PipelineStage_pipelineId_order_key" ON "PipelineStage"("pipelineId", "order");

ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

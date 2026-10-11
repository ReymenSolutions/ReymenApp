-- AlterTable
ALTER TABLE "PipelineStage" ADD COLUMN "leadStatus" "LeadStatus";

-- Las etapas por defecto (las que recibieron todos los clientes) llevan al
-- estado del contacto con el mismo nombre. Las marcadas como ganada/perdida
-- ya se interpretan como WON/LOST sin necesidad de este valor; aquí solo se
-- rellenan las etapas abiertas con los nombres originales y se deja explícito
-- el de ganada/perdida. Las etapas con nombres propios quedan sin mapeo
-- (no cambian el estado) hasta que el cliente lo configure.
UPDATE "PipelineStage" SET "leadStatus" = 'WON'  WHERE "isWon" = true;
UPDATE "PipelineStage" SET "leadStatus" = 'LOST' WHERE "isLost" = true AND "isWon" = false;
UPDATE "PipelineStage" SET "leadStatus" = 'NEW'       WHERE "leadStatus" IS NULL AND lower("name") = 'nuevo';
UPDATE "PipelineStage" SET "leadStatus" = 'CONTACTED' WHERE "leadStatus" IS NULL AND lower("name") = 'contactado';
UPDATE "PipelineStage" SET "leadStatus" = 'QUALIFIED' WHERE "leadStatus" IS NULL AND lower("name") = 'calificado';
UPDATE "PipelineStage" SET "leadStatus" = 'PROPOSAL'  WHERE "leadStatus" IS NULL AND lower("name") = 'propuesta';

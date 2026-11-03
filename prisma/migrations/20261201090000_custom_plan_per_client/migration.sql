-- Plan «A la medida» (Custom Service) por cliente: bandera y límites propios (null = ilimitado cuando customPlan es true).
ALTER TABLE "Organization" ADD COLUMN "customPlan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "customMaxLeads" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "customMaxUsers" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "customMaxAutomations" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "customMaxAiAgents" INTEGER;

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "priceMxn" DECIMAL(10,2) NOT NULL,
    "maxLeads" INTEGER,
    "maxUsers" INTEGER,
    "maxAutomations" INTEGER,
    "aiBudgetMxn" DECIMAL(10,2) NOT NULL,
    "maxAiAgents" INTEGER,
    "modules" "PlatformModule"[],
    "features" JSONB NOT NULL DEFAULT '[]',
    "stripePriceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRevision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE INDEX "PlanRevision_planId_version_idx" ON "PlanRevision"("planId", "version");

-- AddForeignKey
ALTER TABLE "PlanRevision" ADD CONSTRAINT "PlanRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Catálogo inicial: los tres planes actuales, con los valores que hasta hoy estaban en el código.
INSERT INTO "Plan" ("id","key","name","nameEn","priceMxn","maxLeads","maxUsers","maxAutomations","aiBudgetMxn","maxAiAgents","modules","features","sortOrder","updatedAt") VALUES ('plan_starter','starter','Starter','Starter',999,500,2,3,75,1,ARRAY['CRM','AI_WHATSAPP']::"PlatformModule"[],'[{"es": "1 agente IA activo", "en": "1 active AI agent"}, {"es": "CRM y pipeline básico", "en": "Basic CRM and pipeline"}, {"es": "Automatizaciones limitadas", "en": "Limited automations"}, {"es": "Panel de consumo y alertas", "en": "Usage panel and alerts"}, {"es": "Analítica de agentes básica", "en": "Basic agent analytics"}, {"es": "Capacidad adicional mediante recargas", "en": "Extra capacity through top-ups"}, {"es": "Política de uso justo", "en": "Fair use policy"}]'::jsonb,0,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "Plan" ("id","key","name","nameEn","priceMxn","maxLeads","maxUsers","maxAutomations","aiBudgetMxn","maxAiAgents","modules","features","sortOrder","updatedAt") VALUES ('plan_professional','professional','Professional','Professional',1999,5000,10,10,200,3,ARRAY['CRM','AUTOMATIONS','AI_WHATSAPP']::"PlatformModule"[],'[{"es": "3 agentes IA activos", "en": "3 active AI agents"}, {"es": "CRM y pipeline avanzado", "en": "Advanced CRM and pipeline"}, {"es": "Automatizaciones ampliadas", "en": "Expanded automations"}, {"es": "Panel de consumo y alertas", "en": "Usage panel and alerts"}, {"es": "Analítica de agentes avanzada", "en": "Advanced agent analytics"}, {"es": "Capacidad adicional mediante recargas", "en": "Extra capacity through top-ups"}, {"es": "Política de uso justo", "en": "Fair use policy"}]'::jsonb,1,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "Plan" ("id","key","name","nameEn","priceMxn","maxLeads","maxUsers","maxAutomations","aiBudgetMxn","maxAiAgents","modules","features","sortOrder","updatedAt") VALUES ('plan_business','business','Business','Business',3999,NULL,NULL,NULL,500,5,ARRAY['CRM','AUTOMATIONS','AI_WHATSAPP']::"PlatformModule"[],'[{"es": "5 agentes IA activos", "en": "5 active AI agents"}, {"es": "CRM y pipeline completo", "en": "Complete CRM and pipeline"}, {"es": "Automatizaciones personalizadas", "en": "Custom automations"}, {"es": "Panel de consumo y alertas", "en": "Usage panel and alerts"}, {"es": "Analítica de agentes completa", "en": "Complete agent analytics"}, {"es": "Recargas y BYOK opcional", "en": "Top-ups and optional BYOK"}, {"es": "Política de uso justo", "en": "Fair use policy"}]'::jsonb,2,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;

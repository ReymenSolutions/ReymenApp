-- Tope de agentes IA activos por cliente (override pactado; null = el de su plan).
ALTER TABLE "Organization" ADD COLUMN "aiAgentsCapOverride" INTEGER;

-- Antes de aplicar el tope se deja EXPLÍCITO el estado efectivo de cada cliente: los canales sin fila usaban el modo por
-- defecto (SUGGEST), así que se materializa esa fila. No cambia el comportamiento de nadie; solo evita que un cliente
-- "gane" agentes activos implícitos cuando el tope empiece a contarlos.
INSERT INTO "AgentChannelSetting" ("id", "organizationId", "channel", "mode", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || o."id" || c.channel), o."id", c.channel, 'SUGGEST'::"AgentMode", NOW(), NOW()
FROM "Organization" o
CROSS JOIN (VALUES ('whatsapp'), ('instagram'), ('messenger'), ('webchat'), ('email'), ('enquiry')) AS c(channel)
WHERE NOT EXISTS (SELECT 1 FROM "AgentChannelSetting" s WHERE s."organizationId" = o."id" AND s."channel" = c.channel);

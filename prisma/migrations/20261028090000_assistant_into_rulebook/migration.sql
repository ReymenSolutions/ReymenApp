-- El saludo y la personalidad del asistente pasan al Rulebook ("Saludo" y "Cómo hablas"), que es la única fuente de
-- instrucciones del Agente IA. Solo copia datos (las columnas se conservan) y no pisa lo que ya esté escrito.
-- El saludo de fábrica no se copia: no es una decisión del negocio.
INSERT INTO "BusinessRulebook" ("id", "organizationId", "voice", "greeting", "rules", "pricing", "updatedAt")
SELECT 'rb_' || md5(a."organizationId"), a."organizationId",
       left(coalesce(btrim(a."personality"), ''), 4000),
       CASE WHEN a."greeting" = '¡Hola! Soy el asistente virtual. ¿En qué puedo ayudarte?' THEN '' ELSE left(a."greeting", 4000) END,
       '', '', CURRENT_TIMESTAMP
FROM "WhatsAppAssistant" a
WHERE coalesce(btrim(a."personality"), '') <> '' OR a."greeting" <> '¡Hola! Soy el asistente virtual. ¿En qué puedo ayudarte?'
ON CONFLICT ("organizationId") DO UPDATE SET
  "voice" = CASE WHEN btrim("BusinessRulebook"."voice") = '' THEN EXCLUDED."voice" ELSE "BusinessRulebook"."voice" END,
  "greeting" = CASE WHEN btrim("BusinessRulebook"."greeting") = '' THEN EXCLUDED."greeting" ELSE "BusinessRulebook"."greeting" END,
  "updatedAt" = CURRENT_TIMESTAMP;

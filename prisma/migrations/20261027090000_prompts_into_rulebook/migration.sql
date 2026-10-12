-- Los prompts activos pasan al Rulebook (única fuente de instrucciones del Agente IA).
-- Solo copia datos: las tablas de prompts se conservan intactas (se podrán retirar después de revisar el resultado).
-- No pisa nada que el negocio ya haya escrito en su Rulebook.
WITH src AS (
  SELECT
    "organizationId" AS org,
    max(content) FILTER (WHERE type::text = 'SYSTEM') AS sys,
    max(content) FILTER (WHERE type::text = 'GREETING') AS greet,
    string_agg(
      CASE type::text
        WHEN 'LEAD_QUALIFICATION' THEN 'Calificación de interesados: ' || content
        WHEN 'APPOINTMENT_BOOKING' THEN 'Citas: ' || content
        WHEN 'FAQ' THEN 'Preguntas frecuentes: ' || content
        WHEN 'ESCALATION' THEN 'Cuándo pasar con una persona: ' || content
      END,
      E'\n\n' ORDER BY type::text
    ) FILTER (WHERE type::text IN ('LEAD_QUALIFICATION', 'APPOINTMENT_BOOKING', 'FAQ', 'ESCALATION')) AS extra
  FROM "Prompt"
  WHERE "isActive" = true
  GROUP BY "organizationId"
)
INSERT INTO "BusinessRulebook" ("id", "organizationId", "voice", "greeting", "rules", "pricing", "updatedAt")
SELECT 'rb_' || md5(org), org, left(coalesce(sys, ''), 4000), left(coalesce(greet, ''), 4000), left(coalesce(extra, ''), 4000), '', CURRENT_TIMESTAMP
FROM src
ON CONFLICT ("organizationId") DO UPDATE SET
  "voice" = CASE WHEN btrim("BusinessRulebook"."voice") = '' THEN EXCLUDED."voice" ELSE "BusinessRulebook"."voice" END,
  "greeting" = CASE WHEN btrim("BusinessRulebook"."greeting") = '' THEN EXCLUDED."greeting" ELSE "BusinessRulebook"."greeting" END,
  "rules" = CASE
    WHEN EXCLUDED."rules" = '' THEN "BusinessRulebook"."rules"
    WHEN btrim("BusinessRulebook"."rules") = '' THEN EXCLUDED."rules"
    ELSE left("BusinessRulebook"."rules" || E'\n\n' || EXCLUDED."rules", 4000)
  END,
  "updatedAt" = CURRENT_TIMESTAMP;

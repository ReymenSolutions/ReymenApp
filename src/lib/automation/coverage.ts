import { listBlueprints } from "./blueprints";

// ─── Qué va en un blueprint y qué se queda en n8n (#55-D) ────────────────────────────────────────────────────────
// Criterio: «Reymen decide QUÉ debe ocurrir; n8n decide CÓMO se ejecuta la integración externa».
//  - Si la automatización DECIDE A QUIÉN escribir y cuándo (retención, seguimiento, bienvenida), necesita datos del negocio,
//    consentimiento, enfriamiento y simulación: es un blueprint, en el código de la app.
//  - Si solo CONECTA algo externo (captura de leads, agenda, recordatorios, CRM), es una plantilla genérica de n8n.
// Los avisos internos (alertas y reportes) también son blueprints: Reymen arma el destinatario y el texto, n8n solo entrega.

/** Categorías de plantilla cuyo trabajo es decidir a quién se contacta: deben vivir como blueprint. */
export const DECISION_CATEGORIES = ["onboarding", "retention", "follow_up", "notifications"] as const;
/** Categorías de integración: se quedan como plantillas genéricas de n8n. */
export const INTEGRATION_CATEGORIES = ["lead_capture", "appointments", "crm"] as const;

/** Blueprints que ya cubren una categoría de plantilla (vacío = no hay equivalente en la app). */
export function blueprintsCovering(category: string): { key: string; name: string }[] {
  return listBlueprints().filter((b) => b.overlapCategories?.includes(category)).map((b) => ({ key: b.key, name: b.name }));
}

export const isDecisionCategory = (category: string) => (DECISION_CATEGORIES as readonly string[]).includes(category);

import { fingerprint } from "@/lib/ai/agents/legacy";
import { readKnowledge, renderKnowledge } from "@/lib/ai/knowledge/retrieval";
import { prisma } from "@/lib/prisma";

/** Secciones del rulebook. Cada una es texto libre que la IA sigue en cada respuesta del negocio. */
export const RULEBOOK_SECTIONS = ["voice", "greeting", "rules", "pricing"] as const;
export type RulebookSection = (typeof RULEBOOK_SECTIONS)[number];
export type RulebookInput = Record<RulebookSection, string>;

export const RULEBOOK_MAX_CHARS = 4000;
/** Nombres de fábrica del asistente: no son una decisión del negocio, no se mencionan. */
const DEFAULT_AGENT_NAMES = ["Asistente AI", "AI Assistant"];
const KB_ARTICLES_LIMIT = 8;
const KB_ARTICLE_CHARS = 1200;

/** Encabezados con los que cada sección llega al prompt de la IA (en inglés: es el idioma de instrucciones). */
const PROMPT_HEADING: Record<RulebookSection, string> = {
  voice: "HOW YOU TALK",
  greeting: "GREETING",
  rules: "RULES (always follow)",
  pricing: "PRICES (only quote these; never invent others)",
};

export function emptyRulebook(): RulebookInput {
  return { voice: "", greeting: "", rules: "", pricing: "" };
}

/** Limpia lo que llega del formulario: solo texto, sin espacios sobrantes y con tope de largo. */
export function sanitizeRulebook(input: Partial<Record<string, unknown>>): RulebookInput {
  const out = emptyRulebook();
  for (const key of RULEBOOK_SECTIONS) {
    const raw = typeof input[key] === "string" ? (input[key] as string) : "";
    out[key] = raw.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim().slice(0, RULEBOOK_MAX_CHARS);
  }
  return out;
}

/** Cuántas de las 4 secciones tienen contenido (para mostrar el avance en la pantalla). */
export function rulebookProgress(rulebook: RulebookInput): { filled: number; total: number } {
  return { filled: RULEBOOK_SECTIONS.filter((k) => rulebook[k].trim().length > 0).length, total: RULEBOOK_SECTIONS.length };
}

export async function getRulebook(organizationId: string): Promise<RulebookInput> {
  const row = await prisma.businessRulebook.findUnique({ where: { organizationId } });
  return row ? { voice: row.voice, greeting: row.greeting, rules: row.rules, pricing: row.pricing } : emptyRulebook();
}

type PromptArticle = { title: string; content: string; category?: string | null };

/**
 * Texto de instrucciones para la IA de un negocio: el rulebook (secciones con contenido) y, debajo, el
 * conocimiento adicional activo. Las secciones vacías no se mencionan. Devuelve "" si no hay nada.
 */
export function renderRulebookPrompt(rulebook: RulebookInput, articles: PromptArticle[] = [], agentName?: string | null): string {
  const parts: string[] = [];
  const name = agentName?.trim();
  for (const key of RULEBOOK_SECTIONS) {
    const text = rulebook[key].trim();
    if (text) parts.push(`${PROMPT_HEADING[key]}\n${text}`);
  }
  const knowledge = articles.slice(0, KB_ARTICLES_LIMIT).map((a) => `- ${a.title}${a.category ? ` (${a.category})` : ""}: ${a.content.trim().slice(0, KB_ARTICLE_CHARS)}`);
  if (knowledge.length > 0) parts.push(`BUSINESS KNOWLEDGE\n${knowledge.join("\n")}`);
  // El nombre solo acompaña a instrucciones reales: un negocio sin Rulebook sigue contando como "sin instrucciones".
  if (parts.length > 0 && name && !DEFAULT_AGENT_NAMES.includes(name)) parts.unshift(`YOUR NAME\nWhen you introduce yourself, you are ${name}.`);
  return parts.join("\n\n");
}

/** Rulebook + artículos activos del negocio, ya armados como texto para el prompt. */
export async function buildBusinessContext(organizationId: string, query = "", requestKey?: string) {
  const knowledge = await readKnowledge(organizationId, query);
  const [rulebook, assistant, articles] = await Promise.all([
    getRulebook(organizationId),
    prisma.whatsAppAssistant.findUnique({ where: { organizationId }, select: { name: true } }),
    knowledge?.enabled ? Promise.resolve([]) : prisma.knowledgeBase.findMany({ where: { organizationId, isActive: true }, orderBy: { updatedAt: "desc" }, take: KB_ARTICLES_LIMIT, select: { title: true, content: true, category: true } }),
  ]);
  const base = renderRulebookPrompt(rulebook, articles, assistant?.name);
  const references = knowledge?.enabled ? renderKnowledge(knowledge) : "";
  if (knowledge?.enabled) await prisma.auditLog.create({ data: { organizationId, action: "knowledge.retrieve", resource: "AgentInstance", resourceId: knowledge.instanceId, metadata: {
    policyVersion: knowledge.policyVersion, queryHash: fingerprint(query), requestKey: requestKey ?? null,
    eligible: knowledge.eligible, matching: knowledge.matching, considered: knowledge.considered, candidateLimitReached: knowledge.candidateLimitReached,
    characters: knowledge.characters, estimatedTokens: knowledge.estimatedTokens,
    sources: knowledge.selected.map(s => ({ articleId: s.articleId, version: s.version, sourceHash: s.sourceHash, start: s.start, characters: s.content.length, truncated: s.truncated })),
  } } });
  return { instructions: [base, references].filter(Boolean).join("\n\n"), knowledgeVersion: knowledge?.policyVersion ?? null, knowledgeManaged: knowledge?.enabled ?? false };
}
export async function buildBusinessInstructions(organizationId: string, query = ""): Promise<string> {
  return (await buildBusinessContext(organizationId, query)).instructions;
}

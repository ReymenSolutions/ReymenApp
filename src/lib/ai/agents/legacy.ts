import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { INBOX_CHANNELS } from "@/lib/channels";
import { DEFAULT_AGENT_MODE } from "@/lib/agent-mode";

export const LEGACY_DEFINITION = {
  key: "legacy-assistant", version: 1, displayName: "Asistente existente", specialty: "legacy",
  manifest: { runtime: "phase0", effectsOwner: "legacy", tools: [], commercialUnit: "channel", schemaVersion: 1 },
} as const;

/** Stable comparison only. Never log private source text or return it in a public trace. */
export function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** Pure legacy reader: does not require the new tables or create defaults in storage. */
export async function readLegacyConfiguration(tx: Prisma.TransactionClient, organizationId: string) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { isActive: true, plan: true, aiAgentsCapOverride: true } });
  const [assistant, rulebook, settings, modules, articles, prompts] = await Promise.all([
    tx.whatsAppAssistant.findUnique({ where: { organizationId }, select: { id: true, name: true, greeting: true, personality: true, capabilities: true, isActive: true, phoneNumber: true } }),
    tx.businessRulebook.findUnique({ where: { organizationId }, select: { voice: true, greeting: true, rules: true, pricing: true } }),
    tx.agentChannelSetting.findMany({ where: { organizationId }, orderBy: { channel: "asc" }, select: { channel: true, mode: true } }),
    tx.organizationModule.findMany({ where: { organizationId }, orderBy: { module: "asc" }, select: { module: true, status: true, source: true } }),
    tx.knowledgeBase.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, title: true, content: true, category: true, tags: true, isActive: true } }),
    tx.prompt.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, type: true, name: true, content: true, isActive: true, versions: { orderBy: { version: "asc" }, select: { id: true, version: true, content: true, isLatest: true } } } }),
  ]);
  const explicit = new Map(settings.map(s => [s.channel, s.mode]));
  const modes = Object.fromEntries(INBOX_CHANNELS.map(c => [c, explicit.get(c) ?? DEFAULT_AGENT_MODE]));
  const snapshot = {
    schemaVersion: 1, runtime: "legacy", assistant, rulebook, settings, modes, rights: { ...org, modules },
    // Preserve references and detect modifications; do not duplicate KB/prompts or pretend historical prompts are runtime instructions.
    knowledge: articles.map(a => ({ id: a.id, hash: fingerprint(a), isActive: a.isActive })),
    prompts: prompts.map(p => ({ id: p.id, hash: fingerprint(p), versions: p.versions.map(v => ({ id: v.id, version: v.version, hash: fingerprint(v) })) })),
  };
  return { snapshot, sourceHash: fingerprint(snapshot), publicName: assistant?.name ?? "Asistente AI", legacyAssistantId: assistant?.id ?? null,
    inventory: { articles: articles.length, prompts: prompts.length, promptVersions: prompts.reduce((n, p) => n + p.versions.length, 0), activeChannels: Object.values(modes).filter(m => m !== "OFF").length } };
}

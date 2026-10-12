import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertAgentCapacity, getAgentCap, listOrgsOverAgentCap, NEW_ORG_AGENT_SETTINGS } from "./agent-cap";
import { setChannelMode } from "./agent-mode";
import { invalidatePlanCache } from "./plans";

async function makeOrg(plan: string, over: Record<string, string> = {}, override: number | null = null) {
  const org = await prisma.organization.create({ data: { name: `cap-${Math.random()}`, slug: `cap-${Math.random().toString(36).slice(2)}`, plan, n8nWebhookSecret: `s-${Math.random()}`, aiAgentsCapOverride: override } });
  for (const [channel, mode] of Object.entries(over)) await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel, mode: mode as "OFF" | "SUGGEST" | "AUTO" } });
  return org;
}

describe("tope de agentes IA", () => {
  beforeEach(async () => {
    await prisma.plan.upsert({ where: { key: "cap-plan" }, update: { maxAiAgents: 2, isActive: true }, create: { key: "cap-plan", name: "Cap", nameEn: "Cap", priceMxn: 1, aiBudgetMxn: 10, maxAiAgents: 2, sortOrder: 99 } });
    invalidatePlanCache();
  });

  it("cuenta como agentes los canales en SUGGEST/AUTO", async () => {
    const org = await makeOrg("cap-plan", { whatsapp: "AUTO", instagram: "SUGGEST", messenger: "OFF", webchat: "OFF", email: "OFF", enquiry: "OFF" });
    expect(await getAgentCap(org.id)).toMatchObject({ cap: 2, source: "plan", active: 2, overBy: 0 });
  });

  it("bloquea encender un canal apagado al llegar al tope, pero deja cambiar SUGGEST↔AUTO y apagar", async () => {
    const org = await makeOrg("cap-plan", { whatsapp: "SUGGEST", instagram: "SUGGEST", messenger: "OFF", webchat: "OFF", email: "OFF", enquiry: "OFF" });
    await expect(assertAgentCapacity(org.id, "messenger", "SUGGEST")).rejects.toThrow("Tu plan incluye 2 agentes IA activos; apaga uno o mejora tu plan");
    await expect(assertAgentCapacity(org.id, "whatsapp", "AUTO")).resolves.toBeUndefined();
    await expect(assertAgentCapacity(org.id, "whatsapp", "OFF")).resolves.toBeUndefined();
    await setChannelMode(org.id, "whatsapp", "OFF", "u");
    await expect(assertAgentCapacity(org.id, "messenger", "SUGGEST")).resolves.toBeUndefined();
  });

  it("un cliente por encima del tope conserva lo que tiene y no puede activar más", async () => {
    const org = await makeOrg("cap-plan", { whatsapp: "SUGGEST", instagram: "SUGGEST", messenger: "SUGGEST", webchat: "OFF", email: "OFF", enquiry: "OFF" });
    expect(await getAgentCap(org.id)).toMatchObject({ active: 3, overBy: 1 });
    await expect(assertAgentCapacity(org.id, "webchat", "SUGGEST")).rejects.toThrow();
    await expect(assertAgentCapacity(org.id, "messenger", "AUTO")).resolves.toBeUndefined();
    expect((await listOrgsOverAgentCap()).some((r) => r.orgId === org.id && r.active === 3 && r.cap === 2)).toBe(true);
  });

  it("el tope pactado con el cliente reemplaza al del plan", async () => {
    const org = await makeOrg("cap-plan", { whatsapp: "SUGGEST", instagram: "SUGGEST", messenger: "OFF", webchat: "OFF", email: "OFF", enquiry: "OFF" }, 4);
    expect(await getAgentCap(org.id)).toMatchObject({ cap: 4, source: "override" });
    await expect(assertAgentCapacity(org.id, "messenger", "SUGGEST")).resolves.toBeUndefined();
  });

  it("sin filas, los canales cuentan con el modo por defecto (SUGGEST)", async () => {
    const org = await makeOrg("cap-plan");
    expect(await getAgentCap(org.id)).toMatchObject({ active: 6, overBy: 4 });
  });

  it("los clientes nuevos arrancan solo con WhatsApp", () => {
    expect(NEW_ORG_AGENT_SETTINGS.filter((s) => s.mode !== "OFF").map((s) => s.channel)).toEqual(["whatsapp"]);
    expect(NEW_ORG_AGENT_SETTINGS).toHaveLength(6);
  });
});

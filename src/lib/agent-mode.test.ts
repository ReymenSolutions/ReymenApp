// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { getAgentModes, getChannelMode, setChannelMode, isAgentMode } from "./agent-mode";

describe("modo del Agente IA por canal", () => {
  const orgs: string[] = [];
  afterAll(async () => {
    for (const id of orgs) await cleanupOrg(id);
  });

  it("sin configuración sugiere en todos los canales (nunca responde solo)", async () => {
    const org = await createTestOrg("Agent Mode");
    orgs.push(org.id);
    const modes = await getAgentModes(org.id);
    expect(Object.keys(modes)).toEqual(["whatsapp", "instagram", "messenger", "webchat", "email", "enquiry"]);
    expect(Object.values(modes).every((m) => m === "SUGGEST")).toBe(true);
  });

  it("cada canal se cambia por separado, con nombres equivalentes (ig = instagram)", async () => {
    const org = await createTestOrg("Agent Mode 2");
    orgs.push(org.id);
    await setChannelMode(org.id, "ig", "OFF", "u1");
    expect(await getChannelMode(org.id, "instagram")).toBe("OFF");
    expect(await getChannelMode(org.id, "whatsapp")).toBe("SUGGEST");
    await setChannelMode(org.id, "instagram", "SUGGEST", "u1");
    expect(await getChannelMode(org.id, "instagram")).toBe("SUGGEST");
  });

  it("el interruptor activo del asistente refleja si algún canal sigue atendido", async () => {
    const org = await createTestOrg("Agent Mode 3");
    orgs.push(org.id);
    await prisma.whatsAppAssistant.create({ data: { organizationId: org.id, isActive: true, capabilities: [] } });
    for (const ch of ["whatsapp", "instagram", "messenger", "webchat", "email"]) await setChannelMode(org.id, ch, "OFF", "u1");
    expect((await prisma.whatsAppAssistant.findUnique({ where: { organizationId: org.id } }))?.isActive).toBe(true); // enquiry sigue en Sugerir
    await setChannelMode(org.id, "enquiry", "OFF", "u1");
    expect((await prisma.whatsAppAssistant.findUnique({ where: { organizationId: org.id } }))?.isActive).toBe(false);
    await setChannelMode(org.id, "webchat", "SUGGEST", "u1");
    expect((await prisma.whatsAppAssistant.findUnique({ where: { organizationId: org.id } }))?.isActive).toBe(true);
  });

  it("isAgentMode solo acepta los tres modos", () => {
    expect(["OFF", "SUGGEST", "AUTO"].every(isAgentMode)).toBe(true);
    expect(isAgentMode("off")).toBe(false);
    expect(isAgentMode(null)).toBe(false);
  });
});

// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { sanitizeRulebook, rulebookProgress, renderRulebookPrompt, emptyRulebook, getRulebook, buildBusinessInstructions, RULEBOOK_MAX_CHARS } from "./rulebook";

describe("rulebook (puro)", () => {
  it("limpia espacios, normaliza saltos de línea y limita el largo", () => {
    const r = sanitizeRulebook({ voice: "  Directo y cálido.  \r\nSin rodeos.   ", greeting: 5, rules: "x".repeat(RULEBOOK_MAX_CHARS + 50), extra: "ignorado" });
    expect(r.voice).toBe("Directo y cálido.\nSin rodeos.");
    expect(r.greeting).toBe("");
    expect(r.rules).toHaveLength(RULEBOOK_MAX_CHARS);
    expect(Object.keys(r)).toEqual(["voice", "greeting", "rules", "pricing"]);
  });
  it("cuenta las secciones con contenido", () => {
    expect(rulebookProgress(emptyRulebook())).toEqual({ filled: 0, total: 4 });
    expect(rulebookProgress({ ...emptyRulebook(), voice: "a", pricing: "b", rules: "   " })).toEqual({ filled: 2, total: 4 });
  });
  it("arma el prompt con las secciones llenas y el conocimiento, sin mencionar las vacías", () => {
    const text = renderRulebookPrompt({ voice: "Cálido", greeting: "", rules: "Nunca inventes precios", pricing: "Revisión: $500" }, [
      { title: "Horario", content: "Lun a Vie 9-18", category: "General" },
    ]);
    expect(text).toContain("HOW YOU TALK\nCálido");
    expect(text).toContain("RULES (always follow)\nNunca inventes precios");
    expect(text).toContain("PRICES (only quote these; never invent others)\nRevisión: $500");
    expect(text).not.toContain("GREETING");
    expect(text).toContain("BUSINESS KNOWLEDGE\n- Horario (General): Lun a Vie 9-18");
  });
  it("sin nada devuelve texto vacío", () => {
    expect(renderRulebookPrompt(emptyRulebook(), [])).toBe("");
    expect(renderRulebookPrompt(emptyRulebook(), [], "Ana")).toBe(""); // el nombre solo no cuenta como instrucciones
    expect(renderRulebookPrompt({ ...emptyRulebook(), rules: "R" }, [], "Ana")).toContain("you are Ana");
    expect(renderRulebookPrompt({ ...emptyRulebook(), rules: "R" }, [], "Asistente AI")).not.toContain("YOUR NAME");
  });
});

describe("rulebook (base de datos)", () => {
  const orgs: string[] = [];
  afterAll(async () => {
    for (const id of orgs) await cleanupOrg(id);
  });

  it("devuelve vacío si no hay fila y arma las instrucciones solo con artículos activos de ese negocio", async () => {
    const a = await createTestOrg("Rulebook A");
    const b = await createTestOrg("Rulebook B");
    orgs.push(a.id, b.id);
    expect(await getRulebook(a.id)).toEqual(emptyRulebook());
    await prisma.businessRulebook.create({ data: { organizationId: a.id, voice: "Franco" } });
    await prisma.knowledgeBase.createMany({
      data: [
        { organizationId: a.id, title: "Activo A", content: "dato a", isActive: true },
        { organizationId: a.id, title: "Inactivo A", content: "oculto", isActive: false },
        { organizationId: b.id, title: "Otro negocio", content: "no debe verse", isActive: true },
      ],
    });
    const text = await buildBusinessInstructions(a.id);
    expect(text).toContain("HOW YOU TALK\nFranco");
    expect(text).toContain("Activo A");
    expect(text).not.toContain("Inactivo A");
    expect(text).not.toContain("Otro negocio");
  });
});

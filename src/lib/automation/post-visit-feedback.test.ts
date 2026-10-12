// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { processFoodPosOrder } from "@/lib/food";
import { processDomainEvents } from "@/lib/domain-events";
import { runAutomationsForEvent } from "./engine";
import { nextAllowedTime } from "./policy";
import { dispatchPendingExecutions } from "./dispatcher";
import { getBlueprint } from "./blueprints";
import { getPublicFeedback, resolveFeedback, submitFeedback } from "@/lib/feedback";

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

describe("nextAllowedTime (puro)", () => {
  it("empuja al final de las horas de silencio (21 → 9 en CDMX)", () => {
    const q = { start: 21, end: 9 };
    expect(nextAllowedTime(new Date("2030-10-07T04:00:00Z"), "America/Mexico_City", q).toISOString()).toBe("2030-10-07T15:00:00.000Z"); // 22:00 → 09:00
    expect(nextAllowedTime(new Date("2030-10-07T20:00:00Z"), "America/Mexico_City", q).toISOString()).toBe("2030-10-07T20:00:00.000Z"); // 14:00 no cambia
    expect(nextAllowedTime(new Date("2030-10-07T04:00:00Z"), "America/Mexico_City", null).toISOString()).toBe("2030-10-07T04:00:00.000Z");
  });
});

describe("post_visit_feedback", () => {
  let org: { id: string };
  let variantId: string;
  let automationId: string;
  // 15:00 CDMX del 6 de octubre de 2030.
  const AFTERNOON = new Date("2030-10-06T21:00:00Z");
  // 20:00 CDMX: dos horas después caen en horas de silencio.
  const EVENING = new Date("2030-10-07T02:00:00Z");
  const order = (orderId: string, at: Date, phone = "55 4100 0001", extra: Record<string, unknown> = {}) => ({ orderId, grossAmount: 200, netAmount: 172, items: [{ variantId, quantity: 1 }], occurredAt: at.toISOString(), customer: { phone, name: "Ana Torres", consent: { accepted: true, textVersion: "v1" } }, ...extra });
  const tick = (now: Date) => processDomainEvents({ now, organizationId: org.id, consumers: [(e) => runAutomationsForEvent(e, now)] });
  const feedbackExecutions = () => prisma.automationExecution.findMany({ where: { automationId }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    org = await createTestOrg("Feedback Org");
    await prisma.organization.update({ where: { id: org.id }, data: { name: "La Taquería" } });
    for (const mod of ["FOOD_OPS", "REYMEN_POS"] as const) await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" } });
    const dish = await prisma.foodDish.create({ data: { organizationId: org.id, name: "Taco", variants: { create: [{ organizationId: org.id, label: "Único", price: 200 }] } }, include: { variants: true } });
    variantId = dish.variants[0].id;
    await prisma.user.create({ data: { organizationId: org.id, email: `owner-${org.id}@t.mx`, name: "Dueña", role: "OWNER", passwordHash: "x" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });
  beforeEach(async () => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ sent: true });
    await prisma.customerFeedback.deleteMany({ where: { organizationId: org.id } });
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodSale.deleteMany({ where: { organizationId: org.id } });
    await prisma.customer.deleteMany({ where: { organizationId: org.id } });
    const bp = getBlueprint("post_visit_feedback")!;
    const a = await prisma.automation.create({ data: { organizationId: org.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: bp.key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig, reviewUrl: "https://g.page/r/taqueria" } as object, dryRun: false } });
    automationId = a.id;
  });

  it("programa la solicitud 2 h después de la compra, con un enlace único a un formulario de Reymen", async () => {
    await processFoodPosOrder(order("F-1", AFTERNOON), org.id);
    await tick(AFTERNOON);
    const [ex] = await feedbackExecutions();
    expect(ex.status).toBe("PENDING");
    expect(ex.nextAttemptAt?.toISOString()).toBe("2030-10-06T23:00:00.000Z"); // 17:00 CDMX
    const action = ex.action as { templateKey: string; variables: { feedbackUrl: string; name: string }; sendAfter: string };
    expect(action).toMatchObject({ templateKey: "post_visit_feedback_v1", variables: { name: "Ana Torres" }, sendAfter: "2030-10-06T23:00:00.000Z" });
    const fb = await prisma.customerFeedback.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(fb).toMatchObject({ status: "REQUESTED" });
    expect(action.variables.feedbackUrl).toMatch(new RegExp(`/feedback/${fb.token}$`));
    expect(fb.token).toMatch(/^[a-f0-9]{48}$/);
  });

  it("si 2 h después caen en horas de silencio, se programa para la mañana siguiente", async () => {
    await processFoodPosOrder(order("F-2", EVENING), org.id);
    await tick(EVENING);
    const [ex] = await feedbackExecutions();
    expect(ex.nextAttemptAt?.toISOString()).toBe("2030-10-07T15:00:00.000Z"); // 09:00 CDMX del día 7
  });

  it("no sale antes de tiempo, y el plazo de 24 h cuenta desde cuando debía salir", async () => {
    await processFoodPosOrder(order("F-3", EVENING), org.id);
    await tick(EVENING);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubEnv("N8N_WEBHOOK_SECRET", "secret");
    vi.stubEnv("N8N_BASE_URL", "http://n8n.test");
    // A las 23:00 CDMX todavía no toca.
    await dispatchPendingExecutions({ now: new Date("2030-10-07T05:00:00Z"), organizationId: org.id, fetchImpl: fetchImpl as never });
    expect(fetchImpl).not.toHaveBeenCalled();
    // A las 9:30 del día siguiente (más de 7 h después de crearse) sí sale, sin caducar.
    const res = await dispatchPendingExecutions({ now: new Date("2030-10-07T15:30:00Z"), organizationId: org.id, fetchImpl: fetchImpl as never });
    expect(res).toMatchObject({ dispatched: 1, expired: 0 });
    vi.unstubAllEnvs();
  });

  it("en dry-run no crea ninguna solicitud ni enlace real", async () => {
    await prisma.automation.update({ where: { id: automationId }, data: { dryRun: true } });
    await processFoodPosOrder(order("F-4", AFTERNOON), org.id);
    await tick(AFTERNOON);
    const [ex] = await feedbackExecutions();
    expect(ex.status).toBe("DRY_RUN");
    expect(await prisma.customerFeedback.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("una solicitud por venta (reprocesar no la duplica) y un cliente no recibe otra dentro del enfriamiento", async () => {
    await processFoodPosOrder(order("F-5", AFTERNOON), org.id);
    await tick(AFTERNOON);
    const event = await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: org.id, type: "sale.completed" } });
    await runAutomationsForEvent(event, AFTERNOON);
    expect(await prisma.customerFeedback.count({ where: { organizationId: org.id } })).toBe(1);
    // El reloj de la prueba es 2030: la ejecución se "fecha" en ese tiempo para que cuente el enfriamiento.
    await prisma.automationExecution.updateMany({ where: { automationId }, data: { createdAt: AFTERNOON } });
    await processFoodPosOrder(order("F-6", new Date(AFTERNOON.getTime() + 3_600_000)), org.id); // misma persona, mismo día
    await tick(new Date(AFTERNOON.getTime() + 3_600_000));
    expect((await feedbackExecutions()).map((e) => `${e.status}:${e.skipReason ?? ""}`).sort()).toEqual(["PENDING:", "SKIPPED:cooldown"]);
  });

  describe("formulario del cliente", () => {
    const request = async () => {
      await processFoodPosOrder(order(`F-${Math.random()}`, AFTERNOON), org.id);
      await tick(AFTERNOON);
      return prisma.customerFeedback.findFirstOrThrow({ where: { organizationId: org.id } });
    };

    it("la vista pública solo trae lo necesario y el enlace de reseña si se configuró", async () => {
      const fb = await request();
      expect(await getPublicFeedback(fb.token)).toEqual({ businessName: "La Taquería", customerName: "Ana Torres", state: "pending", score: null, reviewUrl: "https://g.page/r/taqueria" });
      expect(await getPublicFeedback("no-existe")).toBeNull();
      expect(await getPublicFeedback("a".repeat(48))).toBeNull();
    });

    it("calificación alta: queda respondida, sin caso ni correo; la reseña se ofrece igual", async () => {
      const fb = await request();
      expect(await submitFeedback(fb.token, { score: 5, comment: "  Todo   perfecto  " })).toEqual({ lowScore: false });
      expect(await prisma.customerFeedback.findUniqueOrThrow({ where: { id: fb.id } })).toMatchObject({ status: "ANSWERED", score: 5, comment: "Todo perfecto" });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(await getPublicFeedback(fb.token)).toMatchObject({ state: "answered", reviewUrl: "https://g.page/r/taqueria" });
    });

    it("calificación baja (≤ 3): abre el caso y avisa por correo a dueños y gerentes", async () => {
      const fb = await request();
      expect(await submitFeedback(fb.token, { score: 2, comment: "Tardaron mucho" })).toEqual({ lowScore: true });
      expect(await prisma.customerFeedback.findUniqueOrThrow({ where: { id: fb.id } })).toMatchObject({ status: "OPEN", score: 2 });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const mail = sendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
      expect(mail.to).toBe(`owner-${org.id}@t.mx`);
      expect(mail.subject).toContain("2/5");
      expect(mail.html).toContain("Tardaron mucho");
      // El límite es 3: un 3 también abre caso.
    });

    it("una calificación de 3 también abre caso; solo cuenta la primera respuesta; valida la calificación", async () => {
      const fb = await request();
      await expect(submitFeedback(fb.token, { score: 0 })).rejects.toThrow(/1 al 5/);
      await expect(submitFeedback(fb.token, { score: 6 })).rejects.toThrow(/1 al 5/);
      await expect(submitFeedback(fb.token, { score: 2.5 })).rejects.toThrow(/1 al 5/);
      await expect(submitFeedback("x".repeat(48), { score: 5 })).rejects.toThrow(/Enlace no válido/);
      await submitFeedback(fb.token, { score: 3 });
      expect((await prisma.customerFeedback.findUniqueOrThrow({ where: { id: fb.id } })).status).toBe("OPEN");
      await expect(submitFeedback(fb.token, { score: 5 })).rejects.toThrow(/Ya recibimos/);
      expect((await prisma.customerFeedback.findUniqueOrThrow({ where: { id: fb.id } })).score).toBe(3);
    });

    it("un comentario larguísimo se recorta; si el correo falla la opinión igual queda guardada", async () => {
      sendEmail.mockRejectedValue(new Error("smtp caído"));
      const fb = await request();
      await submitFeedback(fb.token, { score: 1, comment: "x".repeat(5000) });
      const saved = await prisma.customerFeedback.findUniqueOrThrow({ where: { id: fb.id } });
      expect(saved.comment).toHaveLength(1000);
      expect(saved.status).toBe("OPEN");
    });

    it("el equipo cierra el seguimiento una sola vez y solo en su organización", async () => {
      const fb = await request();
      await submitFeedback(fb.token, { score: 1 });
      await expect(resolveFeedback("otra-org", fb.id, "u1")).rejects.toThrow(/ya no está abierto/);
      await resolveFeedback(org.id, fb.id, "u1", "Se le llamó y se le compensó");
      expect(await prisma.customerFeedback.findUniqueOrThrow({ where: { id: fb.id } })).toMatchObject({ status: "RESOLVED", resolvedById: "u1", resolutionNote: "Se le llamó y se le compensó" });
      await expect(resolveFeedback(org.id, fb.id, "u1")).rejects.toThrow(/ya no está abierto/);
    });
  });
});

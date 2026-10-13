// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const sendEmail = vi.fn().mockResolvedValue({ sent: true });
const notifyAdmins = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: (...a: unknown[]) => notifyAdmins(...a) }));

const { addMonths, billingStatus, noticeKindFor, recordPayment, setBillingDueDate } = await import("./billing");
const { runBillingNotices } = await import("./billing-notices");

const DAY = 86_400_000;
const now = new Date("2026-10-15T12:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * DAY);

describe("estado y avisos de vencimiento", () => {
  it("clasifica al cliente según su vencimiento", () => {
    expect(billingStatus(null, now).state).toBe("NONE");
    expect(billingStatus(inDays(20), now).state).toBe("ACTIVE");
    expect(billingStatus(inDays(7), now).state).toBe("DUE_SOON");
    expect(billingStatus(inDays(-2), now)).toMatchObject({ state: "OVERDUE", daysOver: 2 });
  });

  it("elige un solo aviso vigente: 7, 3 y 1 días antes; vencido y a los 5 días de atraso", () => {
    const kind = (d: number) => noticeKindFor(billingStatus(inDays(d), now));
    expect(kind(20)).toBeNull();
    expect(kind(6.5)).toBe("D7");
    expect(kind(3)).toBe("D3");
    expect(kind(0.5)).toBe("D1");
    expect(kind(-0.5)).toBe("OVERDUE");
    expect(kind(-6)).toBe("OVERDUE_5");
  });

  it("suma meses de calendario conservando el día", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-12-15T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});

describe("pagos y avisos (base de datos)", () => {
  let org: { id: string };
  beforeAll(async () => { org = await createTestOrg("Billing Lib"); });
  afterAll(async () => { await cleanupOrg(org.id); });
  beforeEach(async () => {
    sendEmail.mockClear();
    notifyAdmins.mockClear();
    await prisma.billingNotice.deleteMany({ where: { organizationId: org.id } });
    await prisma.billingPayment.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.update({ where: { id: org.id }, data: { billingPeriodEnd: null } });
    await prisma.user.create({ data: { organizationId: org.id, email: `owner-${Date.now()}-${Math.random()}@t.local`, name: "O", passwordHash: "x", role: "OWNER" } }).catch(() => undefined);
  });

  it("un pago adelantado suma al vencimiento actual; uno vencido cuenta desde hoy", async () => {
    await setBillingDueDate(org.id, inDays(10), "admin1", "alta en cobro");
    const early = await recordPayment(org.id, { amountMxn: 1299, method: "TRANSFER", now });
    expect(early.periodEnd.toISOString().slice(0, 10)).toBe(addMonths(inDays(10), 1).toISOString().slice(0, 10));
    await setBillingDueDate(org.id, inDays(-20), "admin1", "vencido de prueba");
    const late = await recordPayment(org.id, { amountMxn: 1299, method: "CASH", now });
    expect(late.periodEnd.toISOString().slice(0, 10)).toBe(addMonths(now, 1).toISOString().slice(0, 10));
  });

  it("la misma referencia no se registra dos veces y un pago viejo nunca acorta lo pagado", async () => {
    const a = await recordPayment(org.id, { amountMxn: 100, method: "TRANSFER", externalRef: "SPEI-1", months: 3, now });
    const b = await recordPayment(org.id, { amountMxn: 100, method: "TRANSFER", externalRef: "SPEI-1", months: 3, now });
    expect(a.applied).toBe(true);
    expect(b.applied).toBe(false);
    expect(await prisma.billingPayment.count({ where: { organizationId: org.id } })).toBe(1);
    const old = await recordPayment(org.id, { amountMxn: 1, method: "OTHER", periodEnd: inDays(1), now });
    expect(old.periodEnd.getTime()).toBe(a.periodEnd.getTime());
  });

  it("manda cada aviso una sola vez, avisa a los admins en atrasos y respeta a quien no está en el cobro", async () => {
    expect(await runBillingNotices(now)).toMatchObject({ sent: 0 });
    await prisma.organization.update({ where: { id: org.id }, data: { billingPeriodEnd: inDays(2.5) } });
    const first = await runBillingNotices(now);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(sendEmail).toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
    expect((await runBillingNotices(now)).sent).toBe(0);
    expect(await prisma.billingNotice.count({ where: { organizationId: org.id, kind: "D3" } })).toBe(1);

    await prisma.organization.update({ where: { id: org.id }, data: { billingPeriodEnd: inDays(-1) } });
    await runBillingNotices(now);
    expect(await prisma.billingNotice.count({ where: { organizationId: org.id, kind: "OVERDUE" } })).toBe(1);
    expect(notifyAdmins).toHaveBeenCalled();
  });

  it("con cobro automático de Stripe no manda el aviso previo, solo el de atraso", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { billingPeriodEnd: inDays(2.5), stripeSubscriptionStatus: "active" } });
    await runBillingNotices(now);
    expect(await prisma.billingNotice.count({ where: { organizationId: org.id } })).toBe(0);
    await prisma.organization.update({ where: { id: org.id }, data: { stripeSubscriptionStatus: null } });
  });
});

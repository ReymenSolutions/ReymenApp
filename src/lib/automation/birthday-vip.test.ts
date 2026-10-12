// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { runClockDetectors } from "./detectors";
import { runAutomationTick } from "@/lib/automation-tick";
import { getBlueprint } from "./blueprints";
import { parseBirthday, isBirthdayOn } from "@/lib/birthday";
import { parsePosCustomer, upsertCustomer } from "@/lib/customers";

const DAY = 86_400_000;
const NOW = new Date("2030-10-07T21:00:00Z"); // 15:00 del 7 de octubre en CDMX
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("cumpleaños (puro)", () => {
  it("acepta {month,day}, MM-DD y YYYY-MM-DD (descarta el año) y rechaza fechas imposibles", () => {
    expect(parseBirthday({ month: 10, day: 7 })).toEqual({ month: 10, day: 7 });
    expect(parseBirthday("10-07")).toEqual({ month: 10, day: 7 });
    expect(parseBirthday("1990-10-07")).toEqual({ month: 10, day: 7 });
    expect(parseBirthday("02-29")).toEqual({ month: 2, day: 29 });
    for (const bad of ["02-30", "13-01", "00-10", "abc", null, 5, { month: 4, day: 31 }]) expect(parseBirthday(bad)).toBeNull();
  });
  it("quien nació un 29 de febrero lo celebra el 28 en años no bisiestos", () => {
    const b = { month: 2, day: 29 };
    expect(isBirthdayOn(b, "2028-02-29")).toBe(true);
    expect(isBirthdayOn(b, "2028-02-28")).toBe(false);
    expect(isBirthdayOn(b, "2030-02-28")).toBe(true);
    expect(isBirthdayOn(b, "2030-03-01")).toBe(false);
  });
  it("el POS puede mandar el cumpleaños dentro del cliente; uno mal formado se ignora sin tirar al cliente", () => {
    expect(parsePosCustomer({ phone: "5512345678", birthday: "03-15" })?.birthday).toEqual({ month: 3, day: 15 });
    expect(parsePosCustomer({ phone: "5512345678", birthday: "99-99" })).toMatchObject({ phone: "+525512345678", birthday: undefined });
  });
});

describe("customer.birthday y customer.vip", () => {
  let org: { id: string };
  const events = (type: string) => prisma.domainEvent.findMany({ where: { organizationId: org.id, type } });
  const executions = (key: string) => prisma.automationExecution.findMany({ where: { organizationId: org.id, automation: { blueprintKey: key } } });
  let n = 0;
  const customer = (o: { consent?: boolean; birth?: [number, number]; visits?: number; spent?: number; last?: Date; name?: string } = {}) => {
    n++;
    return prisma.customer.create({
      data: { organizationId: org.id, phone: `+52554100${String(n).padStart(4, "0")}`, phoneKey: `554100${String(n).padStart(4, "0")}`, name: o.name ?? `Cliente ${n}`, consentAccepted: o.consent ?? true, birthMonth: o.birth?.[0], birthDay: o.birth?.[1], visitCount: o.visits ?? 1, totalSpent: o.spent ?? 100, lastVisitAt: o.last ?? ago(1) },
    });
  };
  const enable = (key: string, config: object = {}) => {
    const bp = getBlueprint(key)!;
    return prisma.automation.create({ data: { organizationId: org.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig, ...config } as object, dryRun: true } });
  };

  beforeAll(async () => {
    org = await createTestOrg("Birthday VIP Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REYMEN_POS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
  });
  afterAll(async () => cleanupOrg(org.id));
  beforeEach(async () => {
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  });

  it("el POS guarda el cumpleaños solo si el cliente aceptó el contacto", async () => {
    await prisma.$transaction(async (tx) => {
      await upsertCustomer(tx, org.id, { phone: "+525541990001", name: "Con", consent: { accepted: true }, birthday: { month: 3, day: 15 } });
      await upsertCustomer(tx, org.id, { phone: "+525541990002", name: "Sin", consent: { accepted: false }, birthday: { month: 3, day: 15 } });
      await upsertCustomer(tx, org.id, { phone: "+525541990003", name: "Omitido", birthday: { month: 3, day: 15 } }); // nuevo y sin consentimiento
    });
    const rows = await prisma.customer.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" }, select: { name: true, birthMonth: true, birthDay: true } });
    expect(rows).toEqual([{ name: "Con", birthMonth: 3, birthDay: 15 }, { name: "Omitido", birthMonth: null, birthDay: null }, { name: "Sin", birthMonth: null, birthDay: null }]);
    // Quien ya aceptó antes puede completar su cumpleaños en una compra posterior sin repetir el consentimiento.
    await prisma.$transaction((tx) => upsertCustomer(tx, org.id, { phone: "+525541990001", birthday: { month: 4, day: 2 } }));
    expect(await prisma.customer.findFirst({ where: { organizationId: org.id, name: "Con" }, select: { birthMonth: true, birthDay: true } })).toEqual({ birthMonth: 4, birthDay: 2 });
  });

  it("cumpleaños: solo quien cumple HOY y aceptó el contacto, después de la hora configurada; uno por cliente y año", async () => {
    const today = await customer({ birth: [10, 7], name: "Ana" });
    await customer({ birth: [10, 8] });
    await customer({ birth: [10, 7], consent: false });
    await customer();
    await enable("birthday_campaign");
    // 09:00 local (15:00Z): aún no es la hora.
    expect((await runClockDetectors(new Date("2030-10-07T15:00:00Z"), { organizationId: org.id })).birthdays).toBe(0);
    expect((await runClockDetectors(NOW, { organizationId: org.id })).birthdays).toBe(1);
    expect((await runClockDetectors(new Date(NOW.getTime() + 300_000), { organizationId: org.id })).birthdays).toBe(0);
    const [ev] = await events("customer.birthday");
    expect(ev).toMatchObject({ subjectId: today.id, dedupeKey: `customer.birthday:${today.id}:2030` });

    await runAutomationTick(NOW, { organizationId: org.id });
    const [ex] = await executions("birthday_campaign");
    expect(ex).toMatchObject({ status: "DRY_RUN", subjectId: today.id });
    expect(ex.action).toMatchObject({ type: "message", templateKey: "birthday_campaign_v1", variables: { name: "Ana" } });
    // Al año siguiente es otro evento.
    expect((await runClockDetectors(new Date("2031-10-07T21:00:00Z"), { organizationId: org.id })).birthdays).toBe(1);
  });

  it("cumpleaños: el 29 de febrero se felicita el 28 en año no bisiesto", async () => {
    await customer({ birth: [2, 29] });
    await enable("birthday_campaign");
    expect((await runClockDetectors(new Date("2030-02-28T21:00:00Z"), { organizationId: org.id })).birthdays).toBe(1);
  });

  it("VIP: solo quien alcanzó visitas Y gasto con una visita reciente; uno por cliente; el aviso es interno", async () => {
    const vip = await customer({ visits: 5, spent: 3500, last: ago(1), name: "Marta" });
    await customer({ visits: 5, spent: 500, last: ago(1) }); // pocas ventas
    await customer({ visits: 3, spent: 9000, last: ago(1) }); // pocas visitas
    await customer({ visits: 9, spent: 9000, last: ago(60) }); // VIP histórico: no avalancha al encender
    await customer({ visits: 6, spent: 4000, last: ago(1), consent: false }); // el aviso es interno: no requiere consentimiento
    await enable("vip_customer_alert");
    expect((await runClockDetectors(NOW, { organizationId: org.id })).vips).toBe(2);
    expect((await runClockDetectors(new Date(NOW.getTime() + 300_000), { organizationId: org.id })).vips).toBe(0);

    await runAutomationTick(NOW, { organizationId: org.id });
    const ex = (await executions("vip_customer_alert")).find((e) => e.subjectId === vip.id)!;
    expect(ex.status).toBe("DRY_RUN");
    expect(ex.action).toMatchObject({ type: "alert", title: "Marta ya es cliente VIP" });
  });

  it("VIP: umbrales configurables y, si subieron antes de procesar, se omite", async () => {
    await customer({ visits: 5, spent: 3500 });
    await enable("vip_customer_alert", { minVisits: 5, minSpent: 3000 });
    await runClockDetectors(NOW, { organizationId: org.id });
    await prisma.automation.updateMany({ where: { organizationId: org.id }, data: { config: { ...getBlueprint("vip_customer_alert")!.defaultConfig, minSpent: 5000 } as object } });
    await runAutomationTick(NOW, { organizationId: org.id });
    expect(await executions("vip_customer_alert")).toMatchObject([{ status: "SKIPPED", skipReason: "not_vip" }]);
  });
});

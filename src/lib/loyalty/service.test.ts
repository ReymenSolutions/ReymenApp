// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import {
  enrollMember,
  findMemberIdByToken,
  getActiveProgram,
  getPublicCard,
  resolvePublicProgram,
  redeemReward,
  registerVisit,
  saveProgram,
  VISIT_COOLDOWN_MINUTES,
} from "./service";
import { getLoyaltyAnalytics } from "./queries";
import { resolvePeriod } from "./period";
import { can } from "@/lib/permissions";

const PROGRAM = {
  name: "Club Prueba",
  description: null,
  status: "ACTIVE" as const,
  visitGoal: 10,
  rewardType: "FREE_ITEM" as const,
  rewardName: "Bebida gratis",
  rewardDescription: null,
  rewardHeadline: null,
  scope: "ORGANIZATION" as const,
  branchId: null,
};

const MIN = 60_000;
let seq = 0;
const key = () => `test-key-${Date.now()}-${seq++}`;

async function setupOrg(prefix: string) {
  const org = await createTestOrg(prefix);
  await prisma.organizationModule.create({ data: { organizationId: org.id, module: "LOYALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
  const staff = await createTestUser(org.id, "AGENT", `${prefix.toLowerCase().replace(/\W/g, "")}-staff`);
  await saveProgram(org.id, staff.id, PROGRAM);
  return { org, staff };
}

async function enroll(slug: string, phone: string, postalCode = "64610", name = "Mariana López") {
  const r = await enrollMember(slug, { name, whatsapp: phone, postalCode, email: null, branchId: null, consent: true });
  if (r.status !== "created") throw new Error("expected created");
  const m = await prisma.loyaltyMember.findUniqueOrThrow({ where: { publicToken: r.token } });
  return { token: r.token, member: m };
}

describe("REYMEN Loyalty — servicio", () => {
  let A: Awaited<ReturnType<typeof setupOrg>>;
  let B: Awaited<ReturnType<typeof setupOrg>>;

  beforeAll(async () => {
    A = await setupOrg("Loyalty Org A");
    B = await setupOrg("Loyalty Org B");
  });
  afterAll(async () => {
    await cleanupOrg(A.org.id);
    await cleanupOrg(B.org.id);
  });

  describe("inscripción pública", () => {
    it("crea el miembro con token opaco, lo enlaza al Customer del negocio y valida datos", async () => {
      const { token, member } = await enroll(A.org.slug, "81 5550 0001");
      expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(token).not.toContain("5550");
      expect(member.whatsapp).toBe("+528155500001");
      expect(member.postalCode).toBe("64610");
      expect(member.customerId).toBeTruthy();
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: member.customerId! } });
      expect(customer.organizationId).toBe(A.org.id);
      expect(customer.phoneKey).toBe("8155500001");
    });

    it("un número ya inscrito no recibe la tarjeta de nadie (no se filtra el token)", async () => {
      const r = await enrollMember(A.org.slug, { name: "Otra persona", whatsapp: "+52 81 5550 0001", postalCode: "64620", email: null, branchId: null, consent: true });
      expect(r).toEqual({ status: "already_enrolled" });
    });

    it("rechaza datos inválidos y la falta de consentimiento", async () => {
      const base = { name: "Ana", whatsapp: "8155500099", postalCode: "64610", email: null, branchId: null, consent: true };
      await expect(enrollMember(A.org.slug, { ...base, postalCode: "123" })).rejects.toThrow(/5 dígitos/);
      await expect(enrollMember(A.org.slug, { ...base, whatsapp: "123" })).rejects.toThrow(/WhatsApp/);
      await expect(enrollMember(A.org.slug, { ...base, consent: false })).rejects.toThrow(/acepta/);
      await expect(enrollMember("no-existe-este-negocio", base)).rejects.toThrow(/no está disponible/);
    });

    it("ignora una sucursal de otra organización en ?suc=", async () => {
      const foreign = await prisma.branch.create({ data: { organizationId: B.org.id, name: "Ajena" } });
      const r = await enrollMember(A.org.slug, { name: "Luis", whatsapp: "8155500077", postalCode: "64630", email: null, branchId: foreign.id, consent: true });
      expect(r.status).toBe("created");
      const m = await prisma.loyaltyMember.findFirstOrThrow({ where: { organizationId: A.org.id, whatsappKey: "8155500077" } });
      expect(m.enrollmentBranchId).toBeNull();
    });
  });

  describe("visitas y recompensas", () => {
    it("6/10 → 7/10 con monto, y acumula venta y ticket", async () => {
      const { member } = await enroll(A.org.slug, "8155500002");
      await prisma.loyaltyMember.update({ where: { id: member.id }, data: { cycleVisits: 6 } });
      const r = await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 185, idempotencyKey: key() });
      expect(r.replay).toBe(false);
      expect(r.progress).toMatchObject({ current: 7, goal: 10 });
      expect(r.reward).toBeNull();
      const m = await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id } });
      expect(Number(m.totalSpent)).toBe(185);
      expect(m.visitsWithAmount).toBe(1);
      const v = await prisma.loyaltyVisit.findUniqueOrThrow({ where: { id: r.visitId } });
      expect(v.employeeUserId).toBe(A.staff.id);
      expect(Number(v.saleAmount)).toBe(185);
      expect(v.programVersion).toBe(1);
    });

    it("la décima visita genera UNA recompensa con snapshot de la regla y reinicia el ciclo", async () => {
      const { member } = await enroll(A.org.slug, "8155500003");
      await prisma.loyaltyMember.update({ where: { id: member.id }, data: { cycleVisits: 9 } });
      const r = await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 90, idempotencyKey: key() });
      expect(r.reward?.rewardName).toBe("Bebida gratis");
      expect(r.progress).toMatchObject({ current: 10, goal: 10 });
      const m = await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id } });
      expect(m).toMatchObject({ cycleNumber: 2, cycleVisits: 0 });
      const rewards = await prisma.loyaltyReward.findMany({ where: { memberId: member.id } });
      expect(rewards).toHaveLength(1);
      expect(rewards[0]).toMatchObject({ status: "AVAILABLE", cycleNumber: 1, visitGoal: 10, programVersion: 1, earnedVisitId: r.visitId });
    });

    it("la misma llave de idempotencia (doble clic / recarga) no duplica la visita", async () => {
      const { member } = await enroll(A.org.slug, "8155500004");
      const k = key();
      const first = await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 100, idempotencyKey: k });
      const again = await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 100, idempotencyKey: k });
      expect(again.replay).toBe(true);
      expect(again.visitId).toBe(first.visitId);
      expect(await prisma.loyaltyVisit.count({ where: { memberId: member.id } })).toBe(1);
    });

    it("CRITICAL: dos envíos simultáneos con la misma llave dejan una sola visita", async () => {
      const { member } = await enroll(A.org.slug, "8155500005");
      const k = key();
      const args = { organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 50, idempotencyKey: k };
      const results = await Promise.allSettled([registerVisit(args), registerVisit(args), registerVisit(args)]);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      expect(await prisma.loyaltyVisit.count({ where: { memberId: member.id } })).toBe(1);
      const m = await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id } });
      expect(m.totalVisits).toBe(1);
      expect(Number(m.totalSpent)).toBe(50);
    });

    it("CRITICAL: dos registros distintos casi al mismo tiempo no cuentan doble (enfriamiento)", async () => {
      const { member } = await enroll(A.org.slug, "8155500006");
      await prisma.loyaltyMember.update({ where: { id: member.id }, data: { cycleVisits: 9 } });
      const mk = () => registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 80, idempotencyKey: key() });
      const results = await Promise.allSettled([mk(), mk()]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.loyaltyVisit.count({ where: { memberId: member.id } })).toBe(1);
      // Y por lo tanto una sola recompensa para el ciclo.
      expect(await prisma.loyaltyReward.count({ where: { memberId: member.id } })).toBe(1);
      expect(VISIT_COOLDOWN_MINUTES).toBeGreaterThan(0);
    });

    it("pasado el enfriamiento sí registra la siguiente visita", async () => {
      const { member } = await enroll(A.org.slug, "8155500007");
      const t0 = new Date(Date.now() - 60 * MIN);
      await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: null, idempotencyKey: key(), now: t0 });
      const r = await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: null, idempotencyKey: key() });
      expect(r.progress.current).toBe(2);
      const m = await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id } });
      expect(m.visitsWithAmount).toBe(0);
    });

    it("la base impide dos recompensas para el mismo ciclo", async () => {
      const { member } = await enroll(A.org.slug, "8155500008");
      const data = { organizationId: A.org.id, programId: member.programId, memberId: member.id, programVersion: 1, cycleNumber: 1, visitGoal: 10, rewardType: "FREE_ITEM" as const, rewardName: "X" };
      await prisma.loyaltyReward.create({ data });
      await expect(prisma.loyaltyReward.create({ data })).rejects.toThrow();
    });

    it("rechaza montos inválidos", async () => {
      const { member } = await enroll(A.org.slug, "8155500009");
      for (const saleAmount of [-5, 0, 1e9, Number.NaN]) {
        await expect(registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount, idempotencyKey: key() })).rejects.toThrow(/monto/);
      }
    });
  });

  describe("canje", () => {
    it("CRITICAL: una recompensa se canjea una sola vez aunque lleguen dos clics a la vez", async () => {
      const { member } = await enroll(A.org.slug, "8155500010");
      await prisma.loyaltyMember.update({ where: { id: member.id }, data: { cycleVisits: 9 } });
      const v = await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 120, idempotencyKey: key() });
      const rewardId = v.reward!.id;
      const results = await Promise.allSettled([
        redeemReward({ organizationId: A.org.id, userId: A.staff.id, rewardId, branchId: null }),
        redeemReward({ organizationId: A.org.id, userId: A.staff.id, rewardId, branchId: null }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(String(rejected.reason)).toMatch(/ya fue canjeada/);
      const reward = await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: rewardId } });
      expect(reward.status).toBe("REDEEMED");
      expect(reward.redeemedById).toBe(A.staff.id);
      expect(reward.redeemedAt).toBeTruthy();
      // El canje no borra historial y el siguiente ciclo ya está en curso.
      expect(await prisma.loyaltyVisit.count({ where: { memberId: member.id } })).toBe(1);
      expect((await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id } })).cycleNumber).toBe(2);
    });
  });

  describe("cambios de regla", () => {
    it("cambiar la meta crea una versión nueva sin reescribir recompensas ya ganadas", async () => {
      const { org, staff } = await setupOrg("Loyalty Org Versions");
      try {
        const { member } = await enroll(org.slug, "8155500011");
        await prisma.loyaltyMember.update({ where: { id: member.id }, data: { cycleVisits: 9 } });
        await registerVisit({ organizationId: org.id, employeeUserId: staff.id, memberId: member.id, branchId: null, saleAmount: 10, idempotencyKey: key() });

        const res = await saveProgram(org.id, staff.id, { ...PROGRAM, visitGoal: 12 });
        expect(res).toMatchObject({ version: 2, ruleChanged: true });
        const program = await getActiveProgram(org.id);
        expect(program!.rule.visitGoal).toBe(12);
        expect(await prisma.loyaltyProgramVersion.count({ where: { programId: program!.id } })).toBe(2);
        const reward = await prisma.loyaltyReward.findFirstOrThrow({ where: { memberId: member.id } });
        expect(reward).toMatchObject({ visitGoal: 10, programVersion: 1 });

        // Solo cambiar el nombre no crea versión.
        const r2 = await saveProgram(org.id, staff.id, { ...PROGRAM, visitGoal: 12, name: "Club Renombrado" });
        expect(r2).toMatchObject({ version: 2, ruleChanged: false });
      } finally {
        await cleanupOrg(org.id);
      }
    });
  });

  describe("aislamiento entre organizaciones", () => {
    it("CRITICAL: el negocio B no puede ver, registrar visitas ni canjear del negocio A", async () => {
      const { token, member } = await enroll(A.org.slug, "8155500012");
      expect(await findMemberIdByToken(B.org.id, token)).toBeNull();
      expect(await findMemberIdByToken(A.org.id, token)).toBe(member.id);
      await expect(
        registerVisit({ organizationId: B.org.id, employeeUserId: B.staff.id, memberId: member.id, branchId: null, saleAmount: 10, idempotencyKey: key() })
      ).rejects.toThrow(/no encontrado/);
      expect(await prisma.loyaltyVisit.count({ where: { memberId: member.id } })).toBe(0);

      await prisma.loyaltyMember.update({ where: { id: member.id }, data: { cycleVisits: 9 } });
      const v = await registerVisit({ organizationId: A.org.id, employeeUserId: A.staff.id, memberId: member.id, branchId: null, saleAmount: 10, idempotencyKey: key() });
      await expect(redeemReward({ organizationId: B.org.id, userId: B.staff.id, rewardId: v.reward!.id, branchId: null })).rejects.toThrow(/no encontrada/);
      expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: v.reward!.id } })).status).toBe("AVAILABLE");

      // Una sucursal de A no se puede usar desde B.
      const branchA = await prisma.branch.create({ data: { organizationId: A.org.id, name: "Cumbres" } });
      const { member: mb } = await enroll(B.org.slug, "8155500013");
      await expect(
        registerVisit({ organizationId: B.org.id, employeeUserId: B.staff.id, memberId: mb.id, branchId: branchA.id, saleAmount: 10, idempotencyKey: key() })
      ).rejects.toThrow(/sucursal/);
    });

    it("la tarjeta pública solo se abre con el slug de su propio negocio y no expone contacto", async () => {
      const { token } = await enroll(A.org.slug, "8155500014", "64619", "Sofía Ramírez");
      expect(await getPublicCard(B.org.slug, token)).toBeNull();
      const card = await getPublicCard(A.org.slug, token);
      expect(card?.member.name).toBe("Sofía Ramírez");
      const json = JSON.stringify(card?.member);
      expect(json).not.toContain("8155500014");
      expect(json).not.toContain("64619");
    });

    it("analytics de B no incluyen nada de A", async () => {
      const programB = await getActiveProgram(B.org.id);
      const period = resolvePeriod({ p: "30d" }, "America/Mexico_City");
      const a = await getLoyaltyAnalytics({ organizationId: B.org.id, programId: programB!.id, goal: 10, period, branch: undefined, timezone: "America/Mexico_City" });
      const membersB = await prisma.loyaltyMember.count({ where: { organizationId: B.org.id } });
      expect(a.kpis.totalMembers).toBe(membersB);
      expect(a.zones.totals.members).toBe(membersB);
    });
  });

  describe("analytics", () => {
    it("ventas, ticket, participación y agregación por CP cuadran con las visitas registradas", async () => {
      const { org, staff } = await setupOrg("Loyalty Org Analytics");
      try {
        const t = Date.now() - 2 * 86_400_000;
        const people = [
          { phone: "8155501001", cp: "64610", amounts: [200, 260] },
          { phone: "8155501002", cp: "64610", amounts: [140] },
          { phone: "8155501003", cp: "64620", amounts: [100, null] },
        ];
        let i = 0;
        for (const p of people) {
          const { member } = await enroll(org.slug, p.phone, p.cp);
          for (const amount of p.amounts) {
            await registerVisit({ organizationId: org.id, employeeUserId: staff.id, memberId: member.id, branchId: null, saleAmount: amount, idempotencyKey: key(), now: new Date(t + i++ * 3_600_000) });
          }
        }
        await prisma.foodSale.create({ data: { organizationId: org.id, grossAmount: 2000, netAmount: 1724.14, occurredAt: new Date(t) } });

        const program = await getActiveProgram(org.id);
        const period = resolvePeriod({ p: "7d" }, "America/Mexico_City");
        const a = await getLoyaltyAnalytics({ organizationId: org.id, programId: program!.id, goal: 10, period, branch: undefined, timezone: "America/Mexico_City" });

        expect(a.kpis).toMatchObject({ totalMembers: 3, visits: 5, loyaltySales: 700, avgTicket: 175, restaurantSales: 2000, loyaltyShare: 35 });
        const z10 = a.zones.zones.find((z) => z.postalCode === "64610")!;
        const z20 = a.zones.zones.find((z) => z.postalCode === "64620")!;
        expect(z10).toMatchObject({ members: 2, visits: 3, sales: 600, avgTicket: 200, frequency: 1.5 });
        expect(z20).toMatchObject({ members: 1, visits: 2, sales: 100, avgTicket: 100, frequency: 2 });
        expect(z10.salesShare + z20.salesShare).toBeCloseTo(100, 6);
        expect(z10.salesShare).toBe(85.7);
        // La serie diaria suma lo mismo que los KPIs.
        expect(a.series.reduce((s, d) => s + d.visits, 0)).toBe(5);
        expect(a.series.reduce((s, d) => s + d.sales, 0)).toBe(700);
        expect(a.series.reduce((s, d) => s + d.newMembers, 0)).toBe(3);
      } finally {
        await cleanupOrg(org.id);
      }
    });
  });
  describe("módulo propio LOYALTY", () => {
    it("la inscripción pública solo existe si la organización tiene LOYALTY activo (Food no basta)", async () => {
      expect(await resolvePublicProgram(A.org.slug)).not.toBeNull();
      const org = await createTestOrg("Loyalty Solo Food");
      try {
        await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
        const staff = await createTestUser(org.id, "OWNER", "loyaltysolofood-owner");
        await saveProgram(org.id, staff.id, PROGRAM);
        expect(await resolvePublicProgram(org.slug)).toBeNull();
        await expect(
          enrollMember(org.slug, { name: "Ana Ruiz", whatsapp: "81 5550 0999", postalCode: "64610", email: null, branchId: null, consent: true })
        ).rejects.toThrow();
        await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "FOOD_OPS" } }, data: { module: "LOYALTY" } });
        expect(await resolvePublicProgram(org.slug)).not.toBeNull();
      } finally {
        await cleanupOrg(org.id);
      }
    });

    it("configurar el programa pide loyalty:manage; la caja (Agente) solo opera", () => {
      for (const role of ["OWNER", "ADMIN", "MANAGER"] as const) expect(can(role, "loyalty:manage")).toBe(true);
      expect(can("AGENT", "loyalty:manage")).toBe(false);
      expect(can("AGENT", "loyalty:operate")).toBe(true);
      expect(can("VIEWER", "loyalty:operate")).toBe(false);
    });
  });
});

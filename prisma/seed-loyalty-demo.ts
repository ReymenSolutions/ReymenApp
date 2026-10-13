// Datos de DEMOSTRACIÓN para REYMEN Loyalty (branch feature/food-loyalty-demo).
//
//   npx tsx prisma/seed-loyalty-demo.ts
//
// Crea (o recrea) un restaurante ficticio, "Café Norte", con su sucursal
// Cumbres, el programa "Club Café Norte" (10 visitas → bebida gratis) y unos
// 380 clientes ficticios en 8 códigos postales con perfiles distintos, para que
// el mapa, Analytics y los insights cuenten una historia real. Nada de esto son
// datos de personas reales: nombres inventados y teléfonos +52 81 00xx xxxx
// (rango que no existe).
//
// Consistencia: las visitas se generan en orden cronológico y pasan por la
// MISMA regla de ciclo que la caja (applyVisit en src/lib/loyalty/cycle.ts);
// las recompensas, los totales de cada cliente y las ventas totales del
// restaurante se derivan de esas visitas, así que los números cuadran entre
// sí (participaciones que suman 100%, ventas por CP = suma de sus visitas, …).
//
// Es idempotente: si "cafe-norte-demo" ya existe, borra solo SUS datos de
// lealtad y sus ventas de demo, y los vuelve a generar.

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { applyVisit } from "../src/lib/loyalty/cycle";

const ORG_SLUG = "cafe-norte-demo";
const ORG_NAME = "Café Norte";
const OWNER_EMAIL = "demo@cafenorte.test";
const CASHIER_EMAIL = "caja@cafenorte.test";
const DEMO_PASSWORD = "CafeNorte2026!";
const GOAL = 10;
const DAYS = 150;
const SALES_CHANNEL = "Demo lealtad";
const TZ_OFFSET_H = 6; // America/Mexico_City (UTC-6, sin horario de verano)
const DAY = 86_400_000;

// ─── Azar reproducible ───────────────────────────────────────────────
let seedState = 20261012;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
function normal(mean: number, sd: number) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── Perfiles por código postal ──────────────────────────────────────
// visitsPer30: visitas promedio por cliente cada 30 días de antigüedad.
// recentFactor < 1: la zona viene a la baja en el último mes.
const ZONES = [
  { cp: "64610", members: 122, visitsPer30: 3.3, ticket: 212, recentFactor: 1.05 }, // fuerte: muchos, frecuentes, buen ticket
  { cp: "64620", members: 104, visitsPer30: 1.1, ticket: 118, recentFactor: 1.0 }, // muchos clientes, regresan poco y ticket bajo
  { cp: "64619", members: 34, visitsPer30: 2.4, ticket: 345, recentFactor: 1.0 }, // pocos pero valiosos
  { cp: "64630", members: 7, visitsPer30: 1.7, ticket: 185, recentFactor: 1.0 }, // cerca y casi sin clientes: oportunidad
  { cp: "64639", members: 54, visitsPer30: 2.4, ticket: 190, recentFactor: 0.45 }, // frecuencia a la baja
  { cp: "64640", members: 31, visitsPer30: 1.7, ticket: 168, recentFactor: 1.0 },
  { cp: "64650", members: 17, visitsPer30: 1.4, ticket: 158, recentFactor: 1.0 },
  { cp: "64700", members: 9, visitsPer30: 1.0, ticket: 150, recentFactor: 1.0 },
];

const FIRST = ["Mariana", "Juan", "Sofía", "Diego", "Valeria", "Carlos", "Fernanda", "Luis", "Daniela", "Jorge", "Paola", "Andrés", "Regina", "Emilio", "Ximena", "Rodrigo", "Camila", "Héctor", "Natalia", "Pablo", "Alejandra", "Iván", "Lucía", "Mauricio", "Renata", "Óscar", "Andrea", "Gerardo", "Montserrat", "Ricardo"];
const LAST = ["López", "Pérez", "Ramírez", "Garza", "Treviño", "Martínez", "Hernández", "Cantú", "Villarreal", "González", "Salinas", "Elizondo", "Flores", "Leal", "Cavazos", "Sánchez", "Rodríguez", "Guerra", "Saldaña", "Torres"];

function token() {
  return randomBytes(18).toString("base64url");
}

/** Instante dentro del horario del café (8:00–21:00 hora local) de un día; recibe la medianoche local en UTC. */
function atBusinessHour(localMidnightUtc: number): Date {
  return new Date(localMidnightUtc + between(8, 20.9) * 3_600_000);
}

/** Medianoche local (en UTC) del día local que contiene `t`. */
function localDayStart(t: number): number {
  const shifted = t - TZ_OFFSET_H * 3_600_000;
  return Math.floor(shifted / DAY) * DAY + TZ_OFFSET_H * 3_600_000;
}

function amountFor(ticket: number): number | null {
  if (rand() < 0.1) return null; // ~10% de visitas sin monto capturado
  return Math.max(45, Math.round(normal(ticket, ticket * 0.22) / 5) * 5);
}

interface SimVisit {
  at: Date;
  amount: number | null;
  branch: "cumbres" | "main";
}

/** Fechas de visita entre el alta y hoy, con la tendencia de la zona en el último mes. */
function visitDates(enrolledAt: number, now: number, perThirty: number, recentFactor: number): number[] {
  const out: number[] = [];
  const recentFrom = now - 30 * DAY;
  // Paso diario con probabilidad proporcional a la frecuencia de la zona (y de esta persona).
  const personal = Math.max(0.15, normal(1, 0.45));
  for (let d = localDayStart(enrolledAt); d < now; d += DAY) {
    const factor = d >= recentFrom ? recentFactor : 1;
    if (rand() < (perThirty / 30) * personal * factor) out.push(d);
  }
  // Casi todos estrenan su tarjeta el día que se inscriben.
  if (rand() < 0.85 && !out.includes(localDayStart(enrolledAt))) out.unshift(localDayStart(enrolledAt));
  return out;
}

async function main() {
  console.log("☕ Seed de demo REYMEN Loyalty — Café Norte");
  const now = Date.now();

  // ─── Organización, módulo, usuarios y sucursal ─────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME, isActive: true },
    create: { name: ORG_NAME, slug: ORG_SLUG, industry: "Restaurante", n8nWebhookSecret: randomBytes(32).toString("hex"), timezone: "America/Mexico_City" },
  });
  // LOYALTY es el módulo de la demo; FOOD_OPS da las ventas totales del
  // restaurante para calcular la participación de los clientes de lealtad.
  for (const mod of ["LOYALTY", "FOOD_OPS"] as const) {
    await prisma.organizationModule.upsert({
      where: { organizationId_module: { organizationId: org.id, module: mod } },
      update: { status: "ACTIVE" },
      create: { organizationId: org.id, module: mod, status: "ACTIVE", source: "ADMIN_GRANTED", notes: "Demo REYMEN Loyalty" },
    });
  }
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { organizationId: org.id, role: "OWNER", isActive: true, passwordHash: hash },
    create: { email: OWNER_EMAIL, name: "Dueña Café Norte", role: "OWNER", organizationId: org.id, passwordHash: hash },
  });
  const cashier = await prisma.user.upsert({
    where: { email: CASHIER_EMAIL },
    update: { organizationId: org.id, role: "AGENT", isActive: true, passwordHash: hash },
    create: { email: CASHIER_EMAIL, name: "Caja Cumbres", role: "AGENT", organizationId: org.id, passwordHash: hash },
  });
  const cumbres =
    (await prisma.branch.findFirst({ where: { organizationId: org.id, name: "Cumbres" } })) ??
    (await prisma.branch.create({ data: { organizationId: org.id, name: "Cumbres" } }));

  // ─── Limpieza de una corrida anterior (solo datos de esta demo) ─────
  await prisma.loyaltyProgram.deleteMany({ where: { organizationId: org.id } });
  await prisma.foodSale.deleteMany({ where: { organizationId: org.id, channel: SALES_CHANNEL } });
  await prisma.customer.deleteMany({ where: { organizationId: org.id, phone: { startsWith: "+528100" } } });

  // ─── Programa ───────────────────────────────────────────────────────
  const program = await prisma.loyaltyProgram.create({
    data: {
      organizationId: org.id,
      name: "Club Café Norte",
      description: "Acumula visitas en Café Norte y gana bebidas.",
      status: "ACTIVE",
      scope: "ORGANIZATION",
      currentVersion: 1,
      referenceLabel: "Café Norte · Cumbres",
      // Punto aproximado de la sucursal ficticia en Cumbres, Monterrey (mapa OpenStreetMap).
      referenceLat: 25.7333,
      referenceLng: -100.3925,
      isDemo: true,
      createdAt: new Date(now - (DAYS + 5) * DAY),
      versions: {
        create: {
          organizationId: org.id,
          version: 1,
          visitGoal: GOAL,
          rewardType: "FREE_ITEM",
          rewardName: "Bebida gratis",
          rewardDescription: "Elige cualquier bebida de hasta 16 oz.",
          rewardHeadline: "Tu décima visita corre por nuestra cuenta",
          createdById: owner.id,
          effectiveFrom: new Date(now - (DAYS + 5) * DAY),
        },
      },
    },
  });

  // ─── Clientes y visitas simuladas ───────────────────────────────────
  type Sim = {
    id: string;
    name: string;
    phone: string;
    cp: string;
    email: string | null;
    enrolledAt: Date;
    enrollmentBranch: "cumbres" | "main";
    visits: SimVisit[];
  };
  const sims: Sim[] = [];
  let phoneSeq = 1;
  const usedNames = new Set<string>();
  const newName = () => {
    for (;;) {
      const n = `${pick(FIRST)} ${pick(LAST)}`;
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
  };
  usedNames.add("Mariana López");
  usedNames.add("Juan Pérez");
  usedNames.add("Sofía Ramírez");

  for (const z of ZONES) {
    for (let i = 0; i < z.members; i++) {
      // Más altas recientes que antiguas: el programa va creciendo.
      const ageDays = Math.floor(DAYS * Math.pow(rand(), 1.35));
      const enrolledAt = atBusinessHour(localDayStart(now - ageDays * DAY));
      if (enrolledAt.getTime() > now) continue;
      const ticket = z.ticket * Math.max(0.6, normal(1, 0.15));
      const branch = rand() < 0.85 ? "cumbres" : "main";
      const dates = visitDates(enrolledAt.getTime(), now, z.visitsPer30, z.recentFactor);
      const visits = dates
        .map((d) => ({ at: d === localDayStart(enrolledAt.getTime()) ? new Date(enrolledAt.getTime() + 5 * 60_000) : atBusinessHour(d), amount: amountFor(ticket), branch: (rand() < 0.88 ? branch : branch === "cumbres" ? "main" : "cumbres") as SimVisit["branch"] }))
        .filter((v) => v.at.getTime() < now - 30 * 60_000);
      sims.push({
        id: `seed-${org.id}-${phoneSeq}`,
        name: newName(),
        phone: `+528100${String(100000 + phoneSeq).slice(-6)}`,
        cp: z.cp,
        email: rand() < 0.35 ? `cliente${phoneSeq}@ejemplo.test` : null,
        enrolledAt,
        enrollmentBranch: branch,
        visits,
      });
      phoneSeq++;
    }
  }

  // Personajes de la demo, con estado exacto para los escenarios en caja.
  function scripted(name: string, cp: string, cycleTarget: number, extraFullCycles: number, ticket: number, lastVisitDaysAgo: number): Sim {
    const total = extraFullCycles * GOAL + cycleTarget;
    const start = now - (lastVisitDaysAgo + total * 4 + 3) * DAY;
    const visits: SimVisit[] = Array.from({ length: total }, (_, i) => ({
      at: atBusinessHour(localDayStart(start + (i + 1) * 4 * DAY)),
      amount: Math.round(normal(ticket, ticket * 0.12) / 5) * 5,
      branch: "cumbres",
    }));
    if (visits.length) visits[visits.length - 1].at = atBusinessHour(localDayStart(now - lastVisitDaysAgo * DAY));
    const s: Sim = { id: `seed-${org.id}-${phoneSeq}`, name, phone: `+528100${String(100000 + phoneSeq).slice(-6)}`, cp, email: null, enrolledAt: new Date(start), enrollmentBranch: "cumbres", visits };
    phoneSeq++;
    return s;
  }
  const mariana = scripted("Mariana López", "64610", 6, 1, 185, 6); // 6/10 → demo de 6 a 7
  const juan = scripted("Juan Pérez", "64610", 9, 2, 205, 4); // 9/10 → demo de llegar a 10/10
  const sofia = scripted("Sofía Ramírez", "64619", 0, 1, 330, 2); // recompensa disponible → demo de canje
  sims.push(mariana, juan, sofia);
  const keepAvailable = new Set([sofia.id]);

  // ─── Pasar las visitas por la regla del ciclo ───────────────────────
  const memberRows: Prisma.LoyaltyMemberCreateManyInput[] = [];
  const customerRows: Prisma.CustomerCreateManyInput[] = [];
  const visitRows: Prisma.LoyaltyVisitCreateManyInput[] = [];
  const rewardRows: Prisma.LoyaltyRewardCreateManyInput[] = [];
  let visitSeq = 0;

  for (const s of sims) {
    s.visits.sort((a, b) => a.at.getTime() - b.at.getTime());
    let state = { cycleNumber: 1, cycleVisits: 0 };
    let spent = 0;
    let withAmount = 0;
    const customerId = `${s.id}-c`;
    customerRows.push({ id: customerId, organizationId: org.id, phone: s.phone, phoneKey: s.phone.slice(-10), name: s.name, createdAt: s.enrolledAt });
    const pendingRewards: { idx: number; earnedAt: number }[] = [];

    for (let i = 0; i < s.visits.length; i++) {
      const v = s.visits[i];
      const outcome = applyVisit(state, GOAL);
      const visitId = `${s.id}-v${i}`;
      visitRows.push({
        id: visitId,
        organizationId: org.id,
        programId: program.id,
        memberId: s.id,
        branchId: v.branch === "cumbres" ? cumbres.id : null,
        employeeUserId: rand() < 0.7 ? cashier.id : owner.id,
        saleAmount: v.amount,
        occurredAt: v.at,
        idempotencyKey: `seed-${visitSeq++}`,
        programVersion: 1,
        cycleNumber: outcome.countedInCycle,
        createdAt: v.at,
      });
      if (v.amount !== null) {
        spent += v.amount;
        withAmount++;
      }
      // Canje: en una visita posterior (con 75% de probabilidad), nunca antes de ganarla.
      for (const p of pendingRewards.filter((p) => p.earnedAt < v.at.getTime() && rewardRows[p.idx].status === "AVAILABLE")) {
        if (!keepAvailable.has(s.id) && rand() < 0.75) {
          rewardRows[p.idx].status = "REDEEMED";
          rewardRows[p.idx].redeemedAt = new Date(v.at.getTime() + 60_000);
          rewardRows[p.idx].redeemedBranchId = v.branch === "cumbres" ? cumbres.id : null;
          rewardRows[p.idx].redeemedById = cashier.id;
        }
      }
      if (outcome.rewardEarned) {
        pendingRewards.push({ idx: rewardRows.length, earnedAt: v.at.getTime() });
        rewardRows.push({
          id: `${s.id}-r${outcome.countedInCycle}`,
          organizationId: org.id,
          programId: program.id,
          memberId: s.id,
          programVersion: 1,
          cycleNumber: outcome.countedInCycle,
          visitGoal: GOAL,
          rewardType: "FREE_ITEM",
          rewardName: "Bebida gratis",
          rewardDescription: "Elige cualquier bebida de hasta 16 oz.",
          status: "AVAILABLE",
          earnedAt: v.at,
          earnedVisitId: visitId,
          createdAt: v.at,
        });
      }
      state = outcome.next;
    }

    memberRows.push({
      id: s.id,
      organizationId: org.id,
      programId: program.id,
      customerId,
      name: s.name,
      whatsapp: s.phone,
      whatsappKey: s.phone.slice(-10),
      postalCode: s.cp,
      email: s.email,
      enrollmentBranchId: s.enrollmentBranch === "cumbres" ? cumbres.id : null,
      publicToken: token(),
      consentTextVersion: "loyalty-enroll-v1",
      consentAt: s.enrolledAt,
      cycleNumber: state.cycleNumber,
      cycleVisits: state.cycleVisits,
      totalVisits: s.visits.length,
      visitsWithAmount: withAmount,
      totalSpent: Math.round(spent * 100) / 100,
      firstVisitAt: s.visits[0]?.at ?? null,
      lastVisitAt: s.visits.at(-1)?.at ?? null,
      createdAt: s.enrolledAt,
    });
  }

  await prisma.customer.createMany({ data: customerRows });
  await prisma.loyaltyMember.createMany({ data: memberRows });
  for (let i = 0; i < visitRows.length; i += 1000) await prisma.loyaltyVisit.createMany({ data: visitRows.slice(i, i + 1000) });
  await prisma.loyaltyReward.createMany({ data: rewardRows });

  // ─── Ventas totales del restaurante (para la participación Loyalty) ──
  // Una venta agregada por día y sucursal: lo que compraron los miembros ese
  // día representa ~30% (±) de lo vendido. Marcadas con canal "Demo lealtad".
  const loyaltyByDay = new Map<string, number>();
  for (const v of visitRows) {
    const d = localDayStart((v.occurredAt as Date).getTime());
    const k = `${d}|${v.branchId ?? "main"}`;
    loyaltyByDay.set(k, (loyaltyByDay.get(k) ?? 0) + Number(v.saleAmount ?? 0));
  }
  const saleRows: Prisma.FoodSaleCreateManyInput[] = [];
  for (let d = localDayStart(now - DAYS * DAY); d <= localDayStart(now); d += DAY) {
    for (const b of ["cumbres", "main"] as const) {
      const loyalty = loyaltyByDay.get(`${d}|${b === "cumbres" ? cumbres.id : "main"}`) ?? 0;
      const base = b === "cumbres" ? 2400 : 650;
      const gross = Math.round(Math.max(base * between(0.85, 1.15), (loyalty / 0.3) * between(0.92, 1.08)));
      const at = new Date(Math.min(d + 20 * 3_600_000, now - 60_000));
      saleRows.push({ organizationId: org.id, occurredAt: at, channel: SALES_CHANNEL, grossAmount: gross, netAmount: Math.round((gross / 1.16) * 100) / 100, branchId: b === "cumbres" ? cumbres.id : null, notes: "Venta agregada del día (demo)" });
    }
  }
  await prisma.foodSale.createMany({ data: saleRows });

  const totalSales = visitRows.reduce((a, v) => a + Number(v.saleAmount ?? 0), 0);
  console.log(`✅ ${memberRows.length} clientes, ${visitRows.length} visitas, ${rewardRows.length} recompensas (${rewardRows.filter((r) => r.status === "REDEEMED").length} canjeadas)`);
  console.log(`✅ Ventas Loyalty identificadas: $${Math.round(totalSales).toLocaleString("es-MX")}`);
  console.log(`✅ Escenarios: Mariana López 6/10, Juan Pérez 9/10, Sofía Ramírez con recompensa disponible`);
  console.log(`\nEntra con ${OWNER_EMAIL} (dueña) o ${CASHIER_EMAIL} (caja) · contraseña ${DEMO_PASSWORD}`);
  console.log(`Inscripción pública: /lealtad/${ORG_SLUG}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupOrg, createTestOrg, createTestUser } from "@/test/helpers";
import { phoneKey } from "@/lib/phone";
import { assertSafeTarget, sanitize } from "../../prisma/sanitize-test";
import { isTestEnv, testEmailAllowed } from "./app-env";

describe("ambiente de prueba · limpieza de la copia de producción", () => {
  let orgId: string;
  let otherOrgId: string;
  let otherLeadPhone: string;
  const oldSecret = { value: "" };

  beforeAll(async () => {
    const org = await createTestOrg("Prueba Limpieza");
    orgId = org.id;
    oldSecret.value = org.n8nWebhookSecret;
    await prisma.organizationModule.create({ data: { organizationId: orgId, module: "REYMEN_POS" } });
    await createTestUser(orgId, "ADMIN", "duena");
    await prisma.lead.create({ data: { organizationId: orgId, name: "Ana Real", phone: "+52 1 81 1234 5678", phoneKey: "8112345678", email: "ana@real.mx" } });
    await prisma.lead.create({ data: { organizationId: orgId, name: "Sin datos" } });
    await prisma.customer.create({ data: { organizationId: orgId, name: "Luis Real", phone: "8187654321", phoneKey: "8187654321" } });
    await prisma.automation.create({ data: { organizationId: orgId, name: "Seguimiento", type: "custom", status: "ACTIVE", webhookSecret: "viejo" } });
    // Otro negocio: no se toca cuando se limita a uno.
    const other = await createTestOrg("Prueba Limpieza Otro");
    otherOrgId = other.id;
    otherLeadPhone = "+52 55 9999 0000";
    await prisma.lead.create({ data: { organizationId: otherOrgId, name: "Otro", phone: otherLeadPhone, phoneKey: "5599990000" } });
  });
  afterAll(async () => {
    await cleanupOrg(orgId);
    await cleanupOrg(otherOrgId);
  });

  it("se niega fuera de prueba o contra la base de producción", () => {
    const ok = { REYMEN_ENV: "test", TEST_PASSWORD: "una-clave-larga", DATABASE_URL: "postgresql://u:p@reymen-test-postgres:5432/reymen" };
    expect(() => assertSafeTarget(ok)).not.toThrow();
    expect(() => assertSafeTarget({ ...ok, REYMEN_ENV: "production" })).toThrow(/REYMEN_ENV=test/);
    expect(() => assertSafeTarget({ ...ok, DATABASE_URL: "postgresql://u:p@reymen-ai-ops-preview-postgres:5432/reymen" })).toThrow(/PRODUCCIÓN/);
    expect(() => assertSafeTarget({ ...ok, TEST_PASSWORD: "corta" })).toThrow(/TEST_PASSWORD/);
  });

  it("borra teléfonos y correos reales, pausa automatizaciones, cambia llaves y contraseñas", async () => {
    const posFile = path.join(mkdtempSync(path.join(tmpdir(), "san-")), "pos.json");
    const r = await sanitize(prisma, { password: "clave-de-prueba-123", orgIds: [orgId], posFile });

    const leads = await prisma.lead.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } });
    const ana = leads.find((l) => l.name === "Ana Real")!;
    expect(ana.phone).not.toContain("1234");
    expect(ana.email).toMatch(/@prueba\.reymen\.mx$/);
    expect(ana.phoneKey).toBe(phoneKey(ana.phone));
    expect(leads.find((l) => l.name === "Sin datos")!.phone).toBeNull();

    const luis = await prisma.customer.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(luis.name).toBe("Luis Real");
    expect(luis.phoneKey).toBe(phoneKey(luis.phone));
    expect(luis.phone).not.toContain("8765");

    const auto = await prisma.automation.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(auto.status).toBe("PAUSED");
    expect(auto.webhookSecret).not.toBe("viejo");

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.n8nWebhookSecret).not.toBe(oldSecret.value);
    const user = await prisma.user.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(await bcrypt.compare("clave-de-prueba-123", user.passwordHash!)).toBe(true);

    // Configuración del POS de prueba con la llave NUEVA del negocio.
    const pos = JSON.parse(readFileSync(posFile, "utf8"));
    expect(pos[orgId].webhookSecret).toBe(org.n8nWebhookSecret);
    expect(pos[orgId].enrollmentCode.length).toBeGreaterThan(10);
    expect(r.enrollment).toHaveLength(1);

    // El otro negocio quedó igual.
    expect((await prisma.lead.findFirstOrThrow({ where: { organizationId: otherOrgId } })).phone).toBe(otherLeadPhone);
  });
});

describe("ambiente de prueba · correos", () => {
  it("en prueba solo manda a la lista permitida", () => {
    const saved = { env: process.env.REYMEN_ENV, list: process.env.TEST_EMAIL_ALLOWLIST };
    process.env.REYMEN_ENV = "test";
    process.env.TEST_EMAIL_ALLOWLIST = "yo@reymen.mx, Otro@Reymen.mx";
    expect(isTestEnv()).toBe(true);
    expect(testEmailAllowed("YO@reymen.mx")).toBe(true);
    expect(testEmailAllowed("otro@reymen.mx")).toBe(true);
    expect(testEmailAllowed("cliente@gmail.com")).toBe(false);
    process.env.REYMEN_ENV = saved.env;
    process.env.TEST_EMAIL_ALLOWLIST = saved.list;
    if (saved.env === undefined) delete process.env.REYMEN_ENV;
    if (saved.list === undefined) delete process.env.TEST_EMAIL_ALLOWLIST;
  });
});

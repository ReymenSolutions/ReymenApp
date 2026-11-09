// Limpia una COPIA de producción para usarla en el ambiente de prueba (apptest.reymen.mx). Lo corre
// deploy/test/clone-prod.sh justo después de restaurar el respaldo y antes de levantar la app de prueba.
//
//   REYMEN_ENV=test TEST_PASSWORD=... DATABASE_URL=<base de PRUEBA> npx tsx prisma/sanitize-test.ts [archivo-pos.json]
//
// Qué hace (todo en una transacción):
//   - Teléfonos y correos de contactos, conversaciones, clientes, Lealtad y proveedores → ficticios (se conservan
//     nombres, ventas, historial y cantidades).
//   - Automatizaciones activas → pausadas. Llaves de n8n, del POS y de las automatizaciones → nuevas.
//   - Canales (WhatsApp/Meta) → apagados. Suscripciones push y dispositivos de Wallet → borrados.
//   - Contraseñas de todos los usuarios → TEST_PASSWORD; sin 2FA; sesiones cerradas.
// Si se pasa un archivo, escribe ahí la configuración del POS de prueba (REYMEN_ORGS) para los negocios con POS.
//
// Se niega a correr si REYMEN_ENV no es "test" o si la base parece la de producción.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/** Nombres de host de la base de producción en el VPS: nunca se limpia esa. */
const PROD_DB_HOSTS = ["reymen-ai-ops-preview-postgres", "reymen_postgres"];

export function assertSafeTarget(env: Record<string, string | undefined>): void {
  if (env.REYMEN_ENV !== "test") throw new Error("Solo corre con REYMEN_ENV=test (ambiente de prueba).");
  const url = env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL inválida.");
  }
  if (PROD_DB_HOSTS.includes(host)) throw new Error(`DATABASE_URL apunta a la base de PRODUCCIÓN (${host}). No se tocó nada.`);
  if ((env.TEST_PASSWORD ?? "").length < 10) throw new Error("Indica TEST_PASSWORD (mínimo 10 caracteres): será la contraseña de todos los usuarios en prueba.");
}

const secret = () => randomBytes(32).toString("hex");

/** Teléfono ficticio único por fila: +52 55 0000 0000 + número de fila. */
const FAKE_PHONE = (rn: string) => `'+5255' || lpad((${rn})::text, 8, '0')`;
const FAKE_KEY = (rn: string) => `'55' || lpad((${rn})::text, 8, '0')`;

/**
 * `orgIds` limita la limpieza a esos negocios (para las pruebas automáticas, que comparten base). Sin él se limpia
 * TODA la base, que es lo que hace el ambiente de prueba.
 */
export async function sanitize(prisma: PrismaClient, opts: { password: string; posFile?: string; orgIds?: string[] }) {
  const hash = await bcrypt.hash(opts.password, 10);
  const ids = opts.orgIds?.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  /** Filtro SQL por negocio (vacío = todos). */
  const inOrgs = (col = `"organizationId"`) => (ids ? ` WHERE ${col} IN (${ids})` : "");
  const andOrgs = (col = `"organizationId"`) => (ids ? ` AND ${col} IN (${ids})` : "");
  const orgWhere = opts.orgIds ? { id: { in: opts.orgIds } } : {};
  const orgs = await prisma.organization.findMany({ where: orgWhere, select: { id: true, name: true } });
  const posOrgIds = new Set(
    (await prisma.organizationModule.findMany({ where: { module: "REYMEN_POS", status: "ACTIVE", ...(opts.orgIds ? { organizationId: { in: opts.orgIds } } : {}) }, select: { organizationId: true } })).map((m) => m.organizationId),
  );
  const pos: Record<string, { webhookSecret: string; enrollmentCode: string }> = {};
  const enrollment: { name: string; code: string }[] = [];

  const counts = await prisma.$transaction(
    async (tx) => {
      const run = (sql: string) => tx.$executeRawUnsafe(sql);
      const c: Record<string, number> = {};

      // ── Datos personales ──
      c.leads = await run(`UPDATE "Lead" l SET
          phone = CASE WHEN l.phone IS NULL THEN NULL ELSE ${FAKE_PHONE("x.rn")} END,
          "phoneKey" = CASE WHEN l.phone IS NULL THEN NULL ELSE ${FAKE_KEY("x.rn")} END,
          email = CASE WHEN l.email IS NULL THEN NULL ELSE 'contacto-' || x.rn || '@prueba.reymen.mx' END
        FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM "Lead"${inOrgs()}) x WHERE x.id = l.id`);
      c.conversations = await run(`UPDATE "Conversation" v SET
          "contactPhone" = CASE WHEN v."contactPhone" IS NULL THEN NULL ELSE ${FAKE_PHONE("x.rn + 10000000")} END,
          "phoneKey" = CASE WHEN v."phoneKey" IS NULL THEN NULL ELSE ${FAKE_KEY("x.rn + 10000000")} END,
          "contactEmail" = CASE WHEN v."contactEmail" IS NULL THEN NULL ELSE 'conversacion-' || x.rn || '@prueba.reymen.mx' END
        FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM "Conversation"${inOrgs()}) x WHERE x.id = v.id`);
      c.customers = await run(`UPDATE "Customer" u SET phone = ${FAKE_PHONE("x.rn + 20000000")}, "phoneKey" = ${FAKE_KEY("x.rn + 20000000")}
        FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM "Customer"${inOrgs()}) x WHERE x.id = u.id`);
      c.loyaltyMembers = await run(`UPDATE "LoyaltyMember" m SET whatsapp = ${FAKE_PHONE("x.rn + 30000000")}, "whatsappKey" = ${FAKE_KEY("x.rn + 30000000")},
          email = CASE WHEN m.email IS NULL THEN NULL ELSE 'lealtad-' || x.rn || '@prueba.reymen.mx' END
        FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM "LoyaltyMember"${inOrgs()}) x WHERE x.id = m.id`);
      c.suppliers = await run(`UPDATE "FoodSupplier" s SET
          phone = CASE WHEN s.phone IS NULL THEN NULL ELSE ${FAKE_PHONE("x.rn + 40000000")} END,
          email = CASE WHEN s.email IS NULL THEN NULL ELSE 'proveedor-' || x.rn || '@prueba.reymen.mx' END
        FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM "FoodSupplier"${inOrgs()}) x WHERE x.id = s.id`);

      // ── Nada sale hacia afuera ──
      c.automationsPaused = await run(`UPDATE "Automation" SET status = 'PAUSED' WHERE status = 'ACTIVE'${andOrgs()}`);
      for (const a of await tx.automation.findMany({ where: opts.orgIds ? { organizationId: { in: opts.orgIds } } : {}, select: { id: true } })) await tx.automation.update({ where: { id: a.id }, data: { webhookSecret: secret() } });
      c.channelsOff = await run(`UPDATE "ChannelConnection" SET enabled = false, "credentialRef" = 'prueba-sin-credencial'${inOrgs()}`);
      const orgUsers = ids ? ` WHERE "userId" IN (SELECT id FROM "User"${inOrgs()})` : "";
      c.pushSubscriptions = await run(`DELETE FROM "PushSubscription"${orgUsers}`);
      c.walletDevices = await run(`DELETE FROM "LoyaltyWalletDevice"${ids ? ` WHERE "memberId" IN (SELECT id FROM "LoyaltyMember"${inOrgs()})` : ""}`);

      // ── Llaves nuevas por negocio (las de producción no sirven aquí) ──
      for (const o of orgs) {
        const webhookSecret = secret();
        await tx.organization.update({ where: { id: o.id }, data: { n8nWebhookSecret: webhookSecret, foodPosReadKey: null } });
        if (posOrgIds.has(o.id)) {
          const code = randomBytes(12).toString("base64url");
          pos[o.id] = { webhookSecret, enrollmentCode: code };
          enrollment.push({ name: o.name, code });
        }
      }

      // ── Acceso: contraseña de prueba, sin 2FA, sin sesiones abiertas ──
      c.users = await tx.user
        .updateMany({ where: opts.orgIds ? { organizationId: { in: opts.orgIds } } : {}, data: { passwordHash: hash, totpSecret: null, totpPendingSecret: null } })
        .then((r) => r.count);
      await run(`DELETE FROM "Session"${orgUsers}`);
      if (!ids) await run(`DELETE FROM "VerificationToken"`);
      return c;
    },
    { timeout: 300_000, maxWait: 10_000 },
  );

  if (opts.posFile) writeFileSync(opts.posFile, JSON.stringify(pos), { mode: 0o600 });
  return { counts, enrollment, posOrgs: Object.keys(pos).length };
}

async function main() {
  assertSafeTarget(process.env);
  const prisma = new PrismaClient();
  try {
    const { counts, enrollment } = await sanitize(prisma, { password: process.env.TEST_PASSWORD!, posFile: process.argv[2] });
    console.log("✓ Copia limpia para prueba:");
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
    if (enrollment.length) {
      console.log("\nCódigos de enlace del POS de PRUEBA (Admin → Conexión en postest.reymen.mx):");
      for (const e of enrollment) console.log(`  ${e.name}: ${e.code}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("sanitize-test.ts")) {
  main().catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);

export function validateStagingEnvironment(env) {
  if (env.REYMEN_STAGING !== 'true') throw new Error('Se requiere REYMEN_STAGING=true');
  const url = new URL(env.DATABASE_URL);
  if (url.protocol !== 'postgresql:' || url.hostname !== 'staging-postgres' ||
      url.port !== '5432' || url.pathname !== '/reymen_mark_staging' ||
      url.username !== 'reymen_staging' || url.search || url.hash || !url.password) {
    throw new Error('Bootstrap rechazado: destino distinto de la base aislada de staging');
  }
  for (const key of ['STAGING_ADMIN_PASSWORD', 'STAGING_OWNER_PASSWORD']) {
    if (!/^[a-f0-9]{64}$/.test(env[key] ?? '')) throw new Error('Faltan contraseñas aleatorias de staging');
  }
}

export async function bootstrap(env = process.env) {
  validateStagingEnvironment(env);
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const { randomBytes } = require('node:crypto');
  const prisma = new PrismaClient();
  try {
    const hashes = await Promise.all([
      bcrypt.hash(env.STAGING_ADMIN_PASSWORD, 12),
      bcrypt.hash(env.STAGING_OWNER_PASSWORD, 12),
    ]);
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20771021)`;
      // Also refuse any already-populated database. No update/upsert/delete/reset paths.
      if (await tx.organization.count() || await tx.user.count()) {
        throw new Error('Base no vacía: bootstrap cancelado; no se modificaron datos');
      }
      await tx.organization.create({ data: {
        name: 'Reymen Piloto', slug: 'reymen-piloto-staging',
        n8nWebhookSecret: randomBytes(32).toString('hex'),
        users: { create: {
          name: 'Operador de prueba', email: 'owner@staging.reymen.test',
          role: 'OWNER', passwordHash: hashes[1],
        } },
        modules: { create: ['CRM', 'AI_WHATSAPP'].map(module => ({
          module, status: 'ACTIVE', source: 'SUBSCRIBED',
        })) },
      } });
      await tx.user.create({ data: {
        name: 'Administrador de prueba', email: 'admin@staging.reymen.test',
        role: 'SUPER_ADMIN', passwordHash: hashes[0],
      } });
    });
    console.log('Organización ficticia y dos usuarios creados. Sin canales ni proveedor real.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrap().catch(() => {
    console.error('Bootstrap cancelado. Comprueba destino, credenciales y que la base esté vacía. No se eliminaron registros.');
    process.exitCode = 1;
  });
}

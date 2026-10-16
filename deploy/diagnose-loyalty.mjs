/** Read-only counts: no customer names, phones, credentials or data mutations. */
import { PrismaClient } from '@prisma/client';
const search = process.argv[2]?.trim();
if (!search) {
  console.error('Uso: node diagnose-loyalty.mjs nombre-del-negocio');
  process.exit(1);
}
const prisma = new PrismaClient();
async function main() {
  const organizations = await prisma.organization.findMany({
    where: { name: { contains: search, mode: 'insensitive' } },
    select: {
      name: true,
      _count: { select: { customers: true } },
      loyaltyPrograms: {
        orderBy: { createdAt: 'asc' },
        select: { name: true, status: true, isPrimary: true, _count: { select: { members: true, visits: true } } },
      },
    },
  });
  console.log(JSON.stringify(organizations, null, 2));
  if (!organizations.length) console.log('No se encontraron negocios con ese nombre en esta base.');
}
main().catch(() => {
  console.error('No se pudo consultar la base. Comprueba la versión desplegada, las migraciones y la conexión del contenedor.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

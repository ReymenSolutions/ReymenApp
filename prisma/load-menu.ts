// Carga un menú completo (categorías, platillos, tamaños y grupos de modificadores) en un negocio que ya existe.
//
//   npx tsx prisma/load-menu.ts villa-gardenia                 # VISTA PREVIA: muestra qué haría, no escribe nada
//   APPLY=1 npx tsx prisma/load-menu.ts villa-gardenia         # aplica (en una sola transacción)
//   ORG_ID=<id> npx tsx prisma/load-menu.ts villa-gardenia     # si el nombre del negocio no basta para encontrarlo
//
// Nunca cambia precios existentes: agrega lo que falta, ajusta mín./máx. de los grupos, limpia duplicados y reporta
// diferencias (ver src/lib/menu-loader.ts).
import { PrismaClient } from "@prisma/client";
import { loadMenu, norm, type MenuLoadReport, type MenuSpec } from "../src/lib/menu-loader";
import { villaGardeniaMenu } from "./menus/villa-gardenia";

const MENUS: Record<string, { spec: MenuSpec; orgName: string }> = {
  "villa-gardenia": { spec: villaGardeniaMenu, orgName: "Villa Gardenia" },
};

function print(report: MenuLoadReport) {
  const section = (title: string, lines: string[]) => {
    console.log(`\n${title} (${lines.length})`);
    for (const l of lines) console.log(`  • ${l}`);
  };
  section("SE CREA", report.created);
  section("SE COMPLETA", report.updated);
  section("REVISAR A MANO (no se tocó)", report.review);
}

async function main() {
  const which = process.argv[2];
  const menu = MENUS[which ?? ""];
  if (!menu) throw new Error(`Indica el menú: ${Object.keys(MENUS).join(", ")}`);
  const apply = process.env.APPLY === "1";
  const prisma = new PrismaClient();
  try {
    let orgId = process.env.ORG_ID;
    if (!orgId) {
      const all = await prisma.organization.findMany({ select: { id: true, name: true, slug: true } });
      const matches = all.filter((o) => norm(o.name).includes(norm(menu.orgName)));
      if (matches.length !== 1) {
        console.log(matches.length ? "Hay varios negocios con ese nombre:" : `No encontré un negocio llamado «${menu.orgName}». Negocios:`);
        for (const o of matches.length ? matches : all) console.log(`  ${o.id}  ${o.name}  (${o.slug})`);
        throw new Error("Vuelve a correrlo con ORG_ID=<id> del negocio correcto.");
      }
      orgId = matches[0].id;
    }
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
    console.log(`Negocio: ${org.name} (${orgId})`);
    console.log(apply ? "MODO: APLICAR" : "MODO: VISTA PREVIA (no se escribe nada). Para aplicar: APPLY=1");

    if (!apply) {
      print(await loadMenu(prisma, orgId, menu.spec, { apply: false }));
      return;
    }
    const report = await prisma.$transaction(async (tx) => {
      const r = await loadMenu(tx, orgId!, menu.spec, { apply: true });
      await tx.auditLog.create({
        data: { organizationId: orgId!, action: "food.menu_bulk_load", resource: "FoodDish", metadata: { menu: which, created: r.created.length, updated: r.updated.length, review: r.review.length } },
      });
      return r;
    }, { timeout: 120_000 });
    print(report);
    console.log("\n✓ Menú cargado. El POS lo descarga solo (si no lo ves, cierra y abre la app).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

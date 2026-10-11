import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateOrgRequest } from "@/lib/api-key-auth";
import { hasModule } from "@/lib/modules";
import { listBranches } from "@/lib/branches";
import { getFoodMenuForPos, getFoodDishCategories, getFoodLowStockForPos } from "@/lib/food";

// Menú (platillos + categoría + variantes + precio + externalPosId + grupos
// de modificadores asignados) para un futuro integrador externo (POS
// propio, kiosko, etc.) -- mismo esquema de auth que /api/v1/knowledge-base:
// X-Api-Key contra el n8nWebhookSecret de ESA organización, o sesión de
// NextAuth para llamadas desde el navegador. También acepta la llave
// separada foodPosReadKey (Fase 17) para que el dispositivo POS pueda leer
// el menú sin guardar la misma llave que firma /api/webhooks/pos/orders --
// esa firma debe quedarse en el servidor del POS, no en el punto de venta.
// GET /api/v1/food/menu?orgId=xxx
export async function GET(req: NextRequest) {
  const authResult = await authenticateOrgRequest(req, { allowFoodPosReadKey: true });
  if (authResult.response) return authResult.response;
  const orgId = authResult.orgId;

  if (!(await hasModule(orgId, "FOOD_OPS"))) {
    return NextResponse.json({ error: "Food module not enabled for this organization" }, { status: 403 });
  }

  const [dishes, categories, lowStock, branches] = await Promise.all([
    getFoodMenuForPos(orgId, req.nextUrl.searchParams.get("branchId")),
    getFoodDishCategories(orgId),
    getFoodLowStockForPos(orgId, req.nextUrl.searchParams.get("branchId")),
    listBranches(orgId, { activeOnly: true }),
  ]);
  // stockStatus (por platillo, variante y opción) e inventory.lowStock son
  // avisos para el POS, nunca bloqueos. Van dentro del hash: un cambio de
  // existencia cambia el ETag y el POS los recibe en su siguiente consulta.
  const content = {
    data: dishes,
    categories: categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
    inventory: { lowStock },
    // Sucursales adicionales activas: cada caja del POS elige a cuál pertenece. La Principal es implícita.
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    total: dishes.length,
  };

  // El hash es del contenido exacto de la respuesta, no de un max(updatedAt)
  // -- un max(updatedAt) no cambia cuando se borra una fila que no era la
  // más reciente (ej. una categoría vieja), así que un POS con esa fila en
  // caché nunca se enteraría del borrado vía 304. El hash de contenido es
  // exacto por construcción: cualquier cambio real en la respuesta, incluido
  // un borrado, cambia el hash.
  const version = createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 32);
  const etag = `"${version}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(
    { data: content.data, categories: content.categories, inventory: content.inventory, branches: content.branches, meta: { total: content.total, version } },
    { headers: { ETag: etag } }
  );
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { getActiveCustomFields } from "@/lib/custom-fields-db";
import { displayValue } from "@/lib/custom-fields";

// Prefixes values that could be interpreted as a formula (=, +, -, @, or a
// leading tab/CR) with a single quote so Excel/Sheets always render CSV
// exports as plain text — otherwise a lead name like "=cmd|'/c calc'!A1"
// (e.g. submitted through the public webhook) could execute on open.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  let str = String(value);
  if (FORMULA_INJECTION_PREFIX.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const session = await auth();
  if (!session?.user.organizationId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!(await hasModule(session.user.organizationId, "CRM"))) {
    return NextResponse.json({ error: "Módulo CRM no habilitado" }, { status: 403 });
  }

  const [leads, customFields] = await Promise.all([
    fetchLeadsForExport(session.user.organizationId),
    getActiveCustomFields(session.user.organizationId),
  ]);

  const headers = ["Nombre", "Email", "Teléfono", "Fuente", "Estado", "Score AI", "Notas", "Fecha", ...customFields.map((f) => escapeCsv(f.label))];
  const rows = leads.map((l) => [
    escapeCsv(l.name),
    escapeCsv(l.email),
    escapeCsv(l.phone),
    escapeCsv(l.source),
    escapeCsv(l.status),
    escapeCsv(l.score != null ? String(l.score) : null),
    escapeCsv(l.notes),
    escapeCsv(l.createdAt.toISOString().split("T")[0]),
    ...customFields.map((f) => escapeCsv(displayValue(f, (l.customFields as Record<string, unknown> | null)?.[f.key]))),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const filename = `leads-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...(leads.length >= EXPORT_MAX_ROWS ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}

/** Tope de filas de una exportación: más allá, se pide acotar o dividir (la respuesta lo indica en `X-Export-Truncated`). */
const EXPORT_MAX_ROWS = 50_000;
const EXPORT_BATCH = 2_000;

/** Lee los leads por lotes (cursor) en vez de cargar la tabla entera de una vez. */
async function fetchLeadsForExport(organizationId: string) {
  const out: Awaited<ReturnType<typeof prisma.lead.findMany>> = [];
  let cursor: string | undefined;
  while (out.length < EXPORT_MAX_ROWS) {
    const batch = await prisma.lead.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: EXPORT_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    out.push(...batch);
    if (batch.length < EXPORT_BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return out;
}

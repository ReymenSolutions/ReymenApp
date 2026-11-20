import { auth } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";

export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024;

function imageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId) return new Response(null, { status: 401 });
  if (!["OWNER", "ADMIN", "SUPER_ADMIN", "AGENT"].includes(session.user.role) || !(await hasModule(orgId, "WORKSHOP"))) return new Response(null, { status: 403 });
  const { id } = await params;
  const body = await request.formData();
  const phase = body.get("phase");
  const file = body.get("file");
  if (!["RECEPCION", "PROCESO", "ENTREGA"].includes(String(phase)) || !(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) return new Response("Invalid image", { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!imageMime(bytes)) return new Response("Unsupported image", { status: 400 });
  let normalized: Buffer;
  try {
    normalized = await sharp(bytes, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch { return new Response("Invalid image", { status: 400 }); }
  const photo = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkshopWorkOrder" WHERE id = ${id} AND "organizationId" = ${orgId} FOR UPDATE`;
    const order = await tx.workshopWorkOrder.findFirst({ where: { id, organizationId: orgId }, select: { id: true, estado: true } });
    if (!order) return { status: 404 as const };
    if (["ENTREGADA", "CANCELADA"].includes(order.estado) || (phase === "RECEPCION" && order.estado !== "RECEPCION") || (phase === "PROCESO" && order.estado !== "EN_REPARACION") || (phase === "ENTREGA" && order.estado !== "LISTA_PARA_ENTREGA")) return { status: 409 as const };
    const created = await tx.workshopPhoto.create({ data: { organizationId: orgId, workOrderId: id, phase: phase as "RECEPCION" | "PROCESO" | "ENTREGA", contentType: "image/jpeg", bytes: Uint8Array.from(normalized), uploadedById: session.user.id }, select: { id: true } });
    return { status: 201 as const, id: created.id };
  });
  if (photo.status !== 201) return new Response(null, { status: photo.status });
  return Response.json({ id: photo.id }, { status: 201 });
}

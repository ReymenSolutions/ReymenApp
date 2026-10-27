import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Foto de una propiedad (WebP guardado en la base). Pública solo si la
// propiedad está publicada y no inactiva; si no, solo para usuarios de la
// misma organización (el panel muestra borradores).
//
// El id cambia si la foto cambia, así que se puede cachear mucho: un CDN o proxy delante (Cloudflare, nginx) la guarda
// sola, y el ETag permite responder 304 sin leer los bytes de la base cuando un navegador revalida.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.realtyPropertyMedia.findUnique({
    where: { id },
    select: { mimeType: true, organizationId: true, property: { select: { publishedAt: true, status: true } } },
  });
  if (!m) return new NextResponse(null, { status: 404 });
  const isPublic = m.property.publishedAt !== null && m.property.status !== "INACTIVE";
  if (!isPublic) {
    const session = await auth();
    if (session?.user.organizationId !== m.organizationId) return new NextResponse(null, { status: 404 });
  }
  const etag = `"${id}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": isPublic ? "public, max-age=31536000, immutable" : "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  const file = await prisma.realtyPropertyMedia.findUnique({ where: { id }, select: { data: true } });
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(file.data), { headers: { ...headers, "Content-Type": m.mimeType } });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Foto de una propiedad (WebP guardado en la base). Pública solo si la
// propiedad está publicada y no inactiva; si no, solo para usuarios de la
// misma organización (el panel muestra borradores).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.realtyPropertyMedia.findUnique({
    where: { id },
    select: { data: true, mimeType: true, organizationId: true, property: { select: { publishedAt: true, status: true } } },
  });
  if (!m) return new NextResponse(null, { status: 404 });
  const isPublic = m.property.publishedAt !== null && m.property.status !== "INACTIVE";
  if (!isPublic) {
    const session = await auth();
    if (session?.user.organizationId !== m.organizationId) return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mimeType,
      // El id cambia si la foto cambia, así que se puede cachear mucho.
      "Cache-Control": isPublic ? "public, max-age=31536000, immutable" : "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

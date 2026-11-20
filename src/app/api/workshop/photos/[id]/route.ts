import { auth } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId) return new Response(null, { status: 401 });
  if (!["OWNER", "ADMIN", "SUPER_ADMIN", "AGENT"].includes(session.user.role) || !(await hasModule(orgId, "WORKSHOP"))) return new Response(null, { status: 403 });
  const { id } = await params;
  const photo = await prisma.workshopPhoto.findFirst({ where: { id, organizationId: orgId }, select: { bytes: true, contentType: true } });
  if (!photo) return new Response(null, { status: 404 });
  return new Response(Buffer.from(photo.bytes), { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

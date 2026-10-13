import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

// Un JWT vale por días: sin esta comprobación, dar de baja a una persona, cambiarle el rol o su contraseña, o suspender su
// organización no surtiría efecto hasta que expirara. Cada petición de servidor verifica el usuario contra la base (con un
// caché de segundos para no pagar una consulta por cada llamada) y toma el rol y la organización VIGENTES, no los del token.

const TTL_MS = 15_000;
type Snapshot = { at: number; ok: boolean; role: string; organizationId: string | null; sessionVersion: number; theme: string; language: string };
const cache = new Map<string, Snapshot>();

/** Olvida lo cacheado de un usuario (se llama al cambiar su contraseña, rol o estado en esta instancia). */
export function invalidateSessionCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

async function snapshot(userId: string): Promise<Snapshot> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true, organizationId: true, sessionVersion: true, theme: true, language: true, organization: { select: { isActive: true } } },
  });
  const ok = !!user && user.isActive && (user.organizationId === null || user.organization?.isActive !== false);
  const snap: Snapshot = { at: Date.now(), ok, role: user?.role ?? "", organizationId: user?.organizationId ?? null, sessionVersion: user?.sessionVersion ?? 0, theme: user?.theme ?? "light", language: user?.language ?? "es" };
  cache.set(userId, snap);
  return snap;
}

/**
 * Devuelve la sesión con rol y organización vigentes, o null si la persona ya no puede entrar (baja, organización suspendida o
 * contraseña cambiada después de emitirse la sesión). Una sesión de suplantación se valida por el admin real.
 */
export async function validateSession(session: Session | null): Promise<Session | null> {
  if (!session?.user?.id) return session;
  const imp = session.user.impersonating;
  if (imp) {
    const admin = await snapshot(imp.adminId);
    return admin.ok && (admin.role === "SUPER_ADMIN" || admin.role === "ADMIN") ? session : null;
  }
  const snap = await snapshot(session.user.id);
  if (!snap.ok) return null;
  if ((session.user.sessionVersion ?? 0) !== snap.sessionVersion) return null;
  session.user.role = snap.role as Session["user"]["role"];
  session.user.organizationId = snap.organizationId;
  // Idioma y tema vienen de la base: cambiarlos en el perfil surte efecto sin tener que volver a iniciar sesión.
  session.user.theme = snap.theme;
  session.user.language = snap.language;
  return session;
}

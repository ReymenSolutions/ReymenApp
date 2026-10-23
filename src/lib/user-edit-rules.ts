import type { UserRole } from "@prisma/client";

// Reglas de quién puede editar a quién desde el panel de administración. Puras (sin base de datos) para poder probarlas.
// Una persona puede ser administrador de la plataforma Y miembro de una organización a la vez: SUPER_ADMIN/ADMIN con
// organizationId. Sus permisos dentro del portal son los de su rol (SUPER_ADMIN tiene los mismos que OWNER).

export const EDITABLE_ROLES = ["SUPER_ADMIN", "ADMIN", "OWNER", "MANAGER", "AGENT", "VIEWER", "CLIENT"] as const satisfies readonly UserRole[];
const PLATFORM = new Set<string>(["SUPER_ADMIN", "ADMIN"]);

export const isPlatformRole = (role: string) => PLATFORM.has(role);

type Input = {
  actor: { id: string; role: string };
  target: { id: string; role: string; organizationId: string | null };
  next: { role: string; organizationId: string | null };
  /** Super administradores activos en toda la plataforma (contando al editado si lo es). */
  activeSuperAdmins: number;
};

/** Devuelve el motivo por el que NO se puede aplicar el cambio, o null si se puede. */
export function checkUserEdit({ actor, target, next, activeSuperAdmins }: Input): string | null {
  const actorIsSuper = actor.role === "SUPER_ADMIN";
  if (!actorIsSuper && (isPlatformRole(target.role) || isPlatformRole(next.role))) {
    return "Solo un super administrador puede modificar a un administrador de la plataforma o asignar ese rol";
  }
  if (!isPlatformRole(next.role) && !next.organizationId) {
    return "Este rol necesita una organización";
  }
  if (actor.id === target.id) {
    if (next.role !== target.role) return "No puedes cambiar tu propio rol";
    if (!isPlatformRole(next.role) && next.organizationId !== target.organizationId) return "No puedes cambiar tu propia organización";
  }
  if (target.role === "SUPER_ADMIN" && next.role !== "SUPER_ADMIN" && activeSuperAdmins <= 1) {
    return "Debe quedar al menos un super administrador activo";
  }
  return null;
}

/** Alta desde Admin → Usuarios: solo un super administrador crea administradores de la plataforma; un rol de cliente exige organización. */
export function checkUserCreate({ actorRole, role, organizationId }: { actorRole: string; role: string; organizationId: string | null }): string | null {
  if (isPlatformRole(role) && actorRole !== "SUPER_ADMIN") return "Solo un super administrador puede crear administradores de la plataforma";
  if (!isPlatformRole(role) && !organizationId) return "Este rol necesita una organización";
  return null;
}

/** Baja definitiva de un usuario. */
export function checkUserDelete({ actor, target, activeSuperAdmins }: { actor: { id: string; role: string }; target: { id: string; role: string; isActive: boolean }; activeSuperAdmins: number }): string | null {
  if (actor.id === target.id) return "No puedes eliminarte a ti mismo";
  if (isPlatformRole(target.role) && actor.role !== "SUPER_ADMIN") return "Solo un super administrador puede eliminar a un administrador de la plataforma";
  if (target.role === "SUPER_ADMIN" && target.isActive && activeSuperAdmins <= 1) return "Debe quedar al menos un super administrador activo";
  return null;
}

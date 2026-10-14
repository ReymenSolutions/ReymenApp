// Pure module — importable from client and server contexts.
//
// El QR de la tarjeta lleva la URL pública de la tarjeta con un token opaco
// (/lealtad/<negocio>/tarjeta/<token>). El token no contiene nombre, teléfono
// ni CP: solo sirve para que el servidor encuentre el perfil. Escanear tu
// propio QR solo abre tu tarjeta; las visitas se confirman desde una sesión
// del negocio.

/** 24 caracteres base64url (144 bits de azar). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

/**
 * Saca el token de lo que capturó la caja: la URL completa que trae el QR, la
 * ruta, o el token solo (lector USB / teclado). Devuelve null si no parece un token.
 */
export function extractMemberToken(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const fromPath = raw.match(/\/tarjeta\/([A-Za-z0-9_-]{24})(?:[/?#]|$)/);
  const candidate = fromPath ? fromPath[1] : raw;
  return TOKEN_PATTERN.test(candidate) ? candidate : null;
}

/** Ruta pública de la tarjeta (sin dominio). */
export function memberCardPath(orgSlug: string, token: string): string {
  return `/lealtad/${encodeURIComponent(orgSlug)}/tarjeta/${token}`;
}

/** Ruta pública de inscripción; opcionalmente atribuida a una sucursal. */
export function enrollmentPath(orgSlug: string, branchId?: string | null): string {
  const base = `/lealtad/${encodeURIComponent(orgSlug)}`;
  return branchId ? `${base}?suc=${encodeURIComponent(branchId)}` : base;
}

/** WhatsApp parcialmente oculto para listas: +52 81 •••• 1234. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

/** Solo el primer nombre, para la tarjeta pública ("Hola, Mariana"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

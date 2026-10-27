// Solo servidor. Comprobaciones comunes de las rutas públicas de la landing (/api/realty/public/*).

/** El navegador manda Origin en los POST; debe ser este mismo sitio. Sin cabecera (curl, servidores) se deja pasar: el límite por IP sigue aplicando. */
export function sameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

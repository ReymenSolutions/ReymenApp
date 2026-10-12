import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { IMPERSONATION_COOKIE, decodeImpersonationCookie } from "@/lib/impersonation-cookie";

// Middleware runs on every request, so it uses the edge-safe config alone
// (no Credentials provider, no PrismaAdapter) instead of importing the full
// auth() from @/lib/auth — that would pull bcrypt, the Prisma client and
// otpauth into the middleware bundle for no reason, since middleware only
// ever reads the already-issued JWT, it never signs in.
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const isAdminRoute = pathname.startsWith("/admin");
  const isPortalRoute = pathname.startsWith("/portal");
  const isWebhookRoute = pathname.startsWith("/api/webhooks");
  const isApiV1Route = pathname.startsWith("/api/v1");
  const isAuthApiRoute = pathname.startsWith("/api/auth");
  const isCronRoute = pathname.startsWith("/api/cron");
  const isHealthRoute = pathname.startsWith("/api/health");
  // Formulario público de opinión (el cliente entra desde un enlace con token único, sin cuenta).
  const isFeedbackRoute = pathname.startsWith("/feedback/");

  // Public routes — webhook and cron routes authenticate themselves
  // (HMAC signature / CRON_SECRET) rather than via session, /api/v1/* routes
  // authenticate via X-Api-Key matched against the org's own n8nWebhookSecret
  // (falling back to session only for browser callers, checked inside each
  // route) so n8n's pull requests must not be redirected to /login here, and
  // the health check must be reachable by load balancers/uptime monitors
  // without a session
  if (isAuthPage || isWebhookRoute || isApiV1Route || isAuthApiRoute || isCronRoute || isHealthRoute || isFeedbackRoute) {
    return NextResponse.next();
  }

  // No session → redirect to login
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = session.user.role;

  // Admin routes require SUPER_ADMIN or ADMIN
  if (isAdminRoute && role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/portal/dashboard", req.url));
  }

  // Portal routes require an organization (or an active impersonation)
  if (isPortalRoute && !session.user.organizationId) {
    const imp = await decodeImpersonationCookie(req.cookies.get(IMPERSONATION_COOKIE)?.value);
    if (imp && imp.adminId === session.user.id && imp.targetOrgId) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // 2026-09-22 — /api/auth se excluye aquí a propósito. El wrapper auth()
  // de NextAuth, al envolver TODO el middleware, resuelve la sesión (y con
  // ella el cookie de csrf-token) ANTES de que corra nuestro callback de
  // abajo — incluso para rutas que el callback luego deja pasar con
  // NextResponse.next() (como isAuthApiRoute). Como /api/auth/* no estaba
  // excluido del matcher, una sola petición a /api/auth/csrf (o al login)
  // terminaba pasando dos veces por la lógica de Auth.js: una en el
  // middleware (resolviendo req.auth) y otra en el route handler real de
  // /api/auth/[...nextauth]/route.ts — cada una generando su PROPIA cookie
  // (csrf-token, y en el login, el session-token). El navegador/cliente
  // recibía dos Set-Cookie del mismo nombre con valores distintos, lo que
  // producía "MissingCSRF" intermitente, y en el login exitoso duplicaba
  // también la cookie de sesión, inflando los headers de la respuesta lo
  // suficiente para que nginx los rechazara con "upstream sent too big
  // header" (502 Bad Gateway) — confirmado en vivo en el VPS de preview.
  // Excluir /api/auth aquí hace que esas rutas las maneje ÚNICAMENTE su
  // propio route handler, sin que el middleware las toque.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|icons/|public|api/auth).*)",
  ],
};

import type { NextAuthConfig, DefaultSession } from "next-auth";
import type { UserRole } from "@prisma/client";

// Edge-safe slice of the NextAuth config: no providers, no adapter, so
// middleware.ts (which runs on every single request) never has to bundle
// Prisma, bcrypt, or otpauth. auth.ts spreads this and adds the Credentials
// provider + PrismaAdapter for the full, Node-only config used everywhere
// else (Server Actions, Route Handlers, Server Components).

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId: string | null;
      theme: string;
      language: string;
      /** Versión de sesión con la que se emitió el JWT (ver session-guard). */
      sessionVersion?: number;
      impersonating?: { adminId: string; adminName: string | null; adminEmail: string } | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: UserRole;
    organizationId: string | null;
    image?: string | null;
    theme?: string | null;
    language?: string | null;
    sessionVersion?: number;
  }
}

export const authConfig = {
  // No providers here — this config is shared with middleware.ts (edge
  // runtime), which only ever reads an already-issued JWT and never signs
  // in, so it must never import the Credentials provider (bcrypt/Prisma).
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session) {
        if (session.image !== undefined) token.image = session.image;
        if (session.theme !== undefined) token.theme = session.theme;
        if (session.language !== undefined) token.language = session.language;
      }
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.image = user.image ?? null;
        token.theme = user.theme ?? "light";
        token.language = user.language ?? "es";
        token.sv = user.sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      // Admins can impersonate — read cookie in server context (fails silently in Edge/middleware)
      if (token && (token.role === "SUPER_ADMIN" || token.role === "ADMIN")) {
        try {
          const { cookies } = await import("next/headers");
          const cookieStore = await cookies();
          const { IMPERSONATION_COOKIE, decodeImpersonationCookie } = await import("./impersonation-cookie");
          // Firmada por el servidor: una cookie editada a mano no se acepta.
          const imp = await decodeImpersonationCookie(cookieStore.get(IMPERSONATION_COOKIE)?.value);
          if (imp) {
            if (imp.adminId === (token.id as string)) {
              session.user.id = imp.targetUserId;
              session.user.name = imp.targetName;
              session.user.email = imp.targetEmail;
              session.user.image = imp.targetImage ?? null;
              session.user.role = imp.targetRole as UserRole;
              session.user.organizationId = imp.targetOrgId;
              session.user.theme = (token.theme as string) ?? "light";
              session.user.language = (token.language as string) ?? "es";
              session.user.impersonating = {
                adminId: imp.adminId,
                adminName: imp.adminName,
                adminEmail: imp.adminEmail,
              };
              return session;
            }
          }
        } catch {
          // cookies() not available in Edge runtime (middleware) — return real session below
        }
      }
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.organizationId = token.organizationId as string | null;
        session.user.image = (token.image as string | null) ?? null;
        session.user.theme = (token.theme as string) ?? "light";
        session.user.language = (token.language as string) ?? "es";
        session.user.impersonating = null;
        session.user.sessionVersion = (token.sv as number | undefined) ?? 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

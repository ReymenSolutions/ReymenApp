import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { checkRateLimit } from "./rate-limit";
import { verifyTotpCode } from "./totp";
import { authConfig } from "./auth.config";
import { validateSession } from "./session-guard";
import type { Session } from "next-auth";
import { clientIp, loginIpRateLimit } from "./client-ip";
export { isAdmin, isClientRole } from "./roles";

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

class TwoFactorRequiredSignin extends CredentialsSignin {
  code = "totp_required";
}

class TwoFactorInvalidSignin extends CredentialsSignin {
  code = "totp_invalid";
}

async function consumeBackupCode(userId: string, code: string, hashes: string[]): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  for (const hash of hashes) {
    if (await bcrypt.compare(normalized, hash)) {
      await prisma.user.update({
        where: { id: userId },
        data: { totpBackupCodeHashes: hashes.filter((h) => h !== hash) },
      });
      return true;
    }
  }
  return false;
}


// A precomputed bcrypt hash with no matching plaintext. Compared against
// when the user doesn't exist (or has no password set) so that
// bcrypt.compare() always runs — otherwise "no such user" returns
// immediately while "wrong password" takes ~bcrypt's full cost-12 runtime,
// letting an attacker time responses to enumerate registered emails.
const DUMMY_PASSWORD_HASH = "$2b$12$0APBnsAoVXPA3KuUG55K3e//22j27ckpDNZu8LeeyOJ9lzBQPbi8e";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  totpCode: z.string().optional(),
});

const nextAuth = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Authenticator code", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        // URLSearchParams (used by the client signIn() call) stringifies an
        // omitted/undefined field as the literal text "undefined" — treat
        // that the same as "no code provided".
        const totpCode =
          parsed.data.totpCode && parsed.data.totpCode !== "undefined" ? parsed.data.totpCode : undefined;

        const ip = clientIp(request);
        const [emailLimit, ipLimit] = await Promise.all([
          checkRateLimit(`login:email:${email.toLowerCase()}`, { limit: 5, windowMs: 10 * 60 * 1000 }),
          ip
            ? checkRateLimit(`login:ip:${ip}`, { limit: loginIpRateLimit(), windowMs: 10 * 60 * 1000 })
            : Promise.resolve({ allowed: true }),
        ]);
        if (!emailLimit.allowed || !ipLimit.allowed) throw new RateLimitedSignin();

        const user = await prisma.user.findUnique({
          where: { email, isActive: true },
          include: { organization: { select: { isActive: true } } },
        });

        // Always run bcrypt.compare, even for a nonexistent user or a
        // suspended org, against a dummy hash — otherwise those cases
        // return near-instantly while a real "wrong password" takes
        // bcrypt's full runtime, letting response timing reveal which
        // emails are registered.
        const orgSuspended = !!user?.organizationId && user.organization?.isActive === false;
        const isValid = await bcrypt.compare(
          password,
          user?.passwordHash && !orgSuspended ? user.passwordHash : DUMMY_PASSWORD_HASH
        );
        if (!user || !user.passwordHash || orgSuspended || !isValid) return null;

        if (user.totpEnabled) {
          if (!totpCode) throw new TwoFactorRequiredSignin();

          const validTotp = user.totpSecret ? verifyTotpCode(user.totpSecret, totpCode) : false;
          const validBackup =
            !validTotp && (await consumeBackupCode(user.id, totpCode, user.totpBackupCodeHashes));
          if (!validTotp && !validBackup) throw new TwoFactorInvalidSignin();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          organizationId: user.organizationId,
          theme: user.theme,
          language: user.language,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * `auth()` para el código de servidor: la sesión del JWT más una comprobación contra la base (usuario activo, organización
 * activa, contraseña no cambiada) y el rol vigente. El middleware, que corre en el edge, sigue leyendo solo el JWT.
 */
export const auth = (async (...args: unknown[]) => {
  const session = await (nextAuth.auth as (...a: unknown[]) => Promise<Session | null>)(...args);
  // `auth(handler)` (envoltorio de ruta) devuelve una función, no una sesión.
  if (typeof session === "function" || args.length > 0) return session;
  return validateSession(session);
}) as typeof nextAuth.auth;

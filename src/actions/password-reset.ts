"use server";

import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { appUrl } from "@/lib/app-url";
import { UserError } from "@/lib/user-error";

const RESET_TOKEN_TTL_MINUTES = 30;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

const emailSchema = z.string().email();

/**
 * Always resolves the same way regardless of whether the email exists,
 * so this endpoint can't be used to enumerate registered accounts.
 */
export async function requestPasswordReset(email: string): Promise<{ success: true }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { success: true };

  // Silently drop the request past the limit — the response is always the
  // same either way, so this can't be used to enumerate accounts.
  const rateLimit = await checkRateLimit(`password-reset:${parsed.data.toLowerCase()}`, {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) return { success: true };

  const user = await prisma.user.findUnique({ where: { email: parsed.data, isActive: true } });
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier: user.email } }),
      prisma.verificationToken.create({
        data: { identifier: user.email, token: tokenHash, expires },
      }),
    ]);

    const resetUrl = appUrl(`/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`);
    const email = passwordResetEmail(resetUrl, RESET_TOKEN_TTL_MINUTES);
    await sendEmail({ to: user.email, subject: email.subject, html: email.html, text: email.text });

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      action: "auth.password_reset_requested",
      resource: "User",
      resourceId: user.id,
    });
  }

  return { success: true };
}

const resetSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function resetPassword(data: {
  email: string;
  token: string;
  password: string;
}): Promise<{ success: true }> {
  const parsed = resetSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const tokenHash = hashToken(parsed.data.token);
  const verification = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: parsed.data.email, token: tokenHash } },
  });

  if (!verification || verification.expires < new Date()) {
    throw new UserError("El enlace de restablecimiento es inválido o ha expirado");
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email, isActive: true } });
  if (!user) throw new UserError("El enlace de restablecimiento es inválido o ha expirado");

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
    prisma.verificationToken.deleteMany({ where: { identifier: parsed.data.email } }),
  ]);

  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    action: "auth.password_reset_completed",
    resource: "User",
    resourceId: user.id,
  });

  return { success: true };
}

import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { sendEmail } from "./email";
import { teamInviteEmail } from "./email-templates";
import { withPlanCapacity } from "./plan-limits";
import { appUrl } from "./app-url";
import { UserError } from "./user-error";

// ─── Alta de un usuario dentro de una organización ───────────────────
// Único camino para crear un usuario de cliente, lo use el panel de admin
// (createOrgUser) o el propio cliente desde su portal (inviteTeamMember).
// Antes eran dos copias que ya se habían separado: la de admin no revisaba
// el límite de usuarios del plan ni mandaba el correo de bienvenida. Cada
// llamador sigue validando por su cuenta QUIÉN puede crear y QUÉ roles
// puede asignar; aquí solo vive lo que debe ser igual para los dos.

export async function createOrgUserRecord(input: {
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
  actorUserId: string;
  auditAction: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new UserError("Ya existe un usuario con ese email");

  const passwordHash = await bcrypt.hash(input.password, 12);

  const [user, org] = await Promise.all([
    withPlanCapacity(input.organizationId, "users", (tx) =>
      tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          organizationId: input.organizationId,
        },
      })
    ),
    prisma.organization.findUnique({ where: { id: input.organizationId }, select: { name: true } }),
  ]);

  await logAudit({
    organizationId: input.organizationId,
    userId: input.actorUserId,
    action: input.auditAction,
    resource: "User",
    resourceId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  const loginUrl = appUrl("/login");
  const email = teamInviteEmail(org?.name ?? "tu organización", loginUrl);
  sendEmail({ to: user.email, subject: email.subject, html: email.html, text: email.text }).catch(() => {});

  return user;
}

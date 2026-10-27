"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSmartcardAdminClient } from "@/lib/smartcard-supabase";
import {
  supportsCardAssignment,
  resolveSmartcardMembership,
  buildSmartcardPublicUrl,
  getSmartcardProfile,
  getProfileThemeInfo,
  setProfileTheme,
  type ProfileThemeInfo,
  updateProfileThemeColors,
  type SmartcardProfile,
  type ProfileLink,
} from "@/lib/smartcard-company";
import { findOrCreateSmartcardAuthUser } from "@/lib/smartcard-link";
import { getRosterPeople } from "@/lib/smartcard-roster";
import { HEX_COLOR } from "@/lib/smartcard-theme";
import { isValidLinkIcon } from "@/lib/smartcard-link-icons";
import { characteristicsToSubtitle } from "@/lib/smartcard-product-input";
import { inviteTeamMember } from "@/actions/team";
import { UserError } from "@/lib/user-error";
import { listCatalog, resolveCatalogItem } from "@/lib/catalog";
import {
  listProfileProducts,
  productColumns,
  PRODUCT_LINK_TYPE,
  MAX_PROFILE_PRODUCTS,
  type ProfileProduct,
} from "@/lib/smartcard-products";

// Owner/admin/manager can edit a company's own cards and download their QR
// — widened from owner/admin-only (2026-09-29, explicit ask: a manager
// shouldn't have to wait on the owner or Reymen for something this
// routine). Team invites (inviteSmartcardTeamMember below) intentionally
// keep the narrower owner/admin-only scope — that decision wasn't revisited.
const CARD_MANAGEMENT_ROLES = ["owner", "admin", "manager"];

/** Shared by every card/profile action below — auth + membership + role. */
async function requireCardManagementMembership() {
  const session = await auth();
  if (!session?.user.organizationId || !session.user.email) {
    throw new Error("Sesión inválida.");
  }

  const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
  if (!result.ok) {
    throw new Error("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
  }
  if (!CARD_MANAGEMENT_ROLES.includes(result.membership.roleCode)) {
    throw new Error("No tienes permiso para hacer eso.");
  }
  return result.membership;
}

/** Cualquier integrante activo de la empresa vinculada, sin importar su rol. */
async function requireMembership() {
  const session = await auth();
  if (!session?.user.organizationId || !session.user.email) {
    throw new Error("Sesión inválida.");
  }
  const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
  if (!result.ok) {
    throw new Error("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
  }
  return result.membership;
}

/** ¿La tarjeta (por id o por su perfil) está asignada a este usuario? */
async function isAssignedTo(column: "id" | "profile_id", value: string, userId: string): Promise<boolean> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("cards")
    .select("id")
    .eq(column, value)
    .eq("assigned_user_id", userId)
    .is("deleted_at", null)
    .limit(1);
  if (error) return false; // sin la columna de asignación, nadie tiene tarjeta propia
  return (data ?? []).length > 0;
}

/**
 * Quién puede editar un perfil: dueño, administrador o gerente, cualquiera
 * de la empresa; un asesor o personal, solo el de la tarjeta que tiene
 * asignada. isManager decide si además puede tocar el diseño y el logo,
 * que fija la empresa para que todas las tarjetas se vean iguales.
 */
async function requireProfileEditor(profileId: string) {
  const membership = await requireMembership();
  const existing = await getSmartcardProfile(profileId, membership.companyId);
  if (!existing) throw new Error("Ese perfil no pertenece a tu empresa.");
  if (CARD_MANAGEMENT_ROLES.includes(membership.roleCode)) return { membership, existing, isManager: true };
  if (!(await isAssignedTo("profile_id", profileId, membership.userId))) {
    throw new Error("Solo puedes editar el perfil de tu propia tarjeta.");
  }
  return { membership, existing, isManager: false };
}

// Roles that can be assigned from this form — mirrors reymen-smartcard's
// apps/ops/app/settings/actions.ts on purpose: "owner" is excluded there
// too (v1: one owner per company, assigned by Reymen directly, not
// reassignable from this form).
const INVITABLE_ROLES = ["admin", "manager", "staff", "agent"];

// Maps a SmartCard-specific role (its own axis, stored only in
// reymen-smartcard's roles/company_users tables) onto this platform's own
// UserRole (governs portal-wide access via can() in permissions.ts). There's
// no 1:1 correspondence — SmartCard's "staff"/"agent" both become the
// portal's AGENT, "admin"/"manager" both become MANAGER. OWNER/ADMIN portal
// roles are never granted from here on purpose, matching inviteTeamMember's
// own MANAGER/AGENT/VIEWER-only self-service scope — real portal admins are
// set up by REYMEN directly, not through a team invite of any kind.
const SMARTCARD_ROLE_TO_USER_ROLE: Record<string, "MANAGER" | "AGENT"> = {
  admin: "MANAGER",
  manager: "MANAGER",
  staff: "AGENT",
  agent: "AGENT",
};

type InviteResult = { success: true } | { success: false; error: string };

/**
 * Rewritten 2026-09-20 after discovering reymen-smartcard's own invite flow
 * was never finished end-to-end: apps/ops/app/auth/confirm/route.ts sends an
 * invited user to /set-password, which doesn't exist in that app (confirmed
 * via that repo's own code comment — the route "nunca se construyó"). So
 * nobody who ever received a Supabase invite email there could actually set
 * a password and get promoted from company_users.status 'invited' to
 * 'active' — every invite dead-ended at /no-access. This predates this
 * integration; we didn't break it, but continuing to depend on it doesn't
 * make sense either, especially given the explicit ask to keep everything
 * in one app instead of bouncing between pages.
 *
 * New flow — no Supabase Auth email, no wait on ops.reymen.mx at all:
 *   1. A Supabase Auth user is created (or reused if one already exists for
 *      that email) via the admin API, with a random password nobody will
 *      ever use — it exists purely so company_users.user_id has something
 *      to reference. Nobody logs in through Supabase Auth for this.
 *   2. company_users is inserted with status 'active' immediately — there's
 *      no separate activation step left to wait on.
 *   3. The account the person actually logs into is an ordinary
 *      AI-Ops-Platform portal account: reuses inviteTeamMember()
 *      (src/actions/team.ts) as-is for a brand-new email — same
 *      inviter-sets-a-temporary-password UX and notification email as
 *      "Invitar usuario" in Configuración — or, if that email already
 *      belongs to a User in this same organization, just attaches SmartCard
 *      access to the account they already have.
 *
 * Explicit product decision (not a default): the portal account this
 * creates gets ordinary org-wide access per its UserRole (leads, pipeline,
 * conversations, etc.), same as any other team invite — there's no
 * SmartCard-only login today. See SMARTCARD_ROLE_TO_USER_ROLE above. One
 * real consequence of that choice: this now also counts against the org's
 * general "users" plan capacity (assertPlanCapacity inside inviteTeamMember),
 * on top of SmartCard's own separate max_team_members seat limit — an org
 * already at its general user cap can't add a SmartCard member either,
 * until its plan is upgraded or a seat is freed.
 *
 * Returns a result object instead of throwing (2026-09-20): Next.js
 * redacts a thrown Server Action error's message in production ("An error
 * occurred in the Server Components render..."), so the friendly Spanish
 * messages below never reached the client — every failure surfaced as a
 * generic crash instead of a toast. All internal validation still throws
 * (kept for readable early-return control flow); only the outermost catch
 * here converts that into { success: false, error }.
 */
export async function inviteSmartcardTeamMember(
  name: string,
  email: string,
  roleCode: string,
  password: string
): Promise<InviteResult> {
  try {
    await run(name, email, roleCode, password);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo procesar la invitación. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] inviteSmartcardTeamMember falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

async function run(name: string, email: string, roleCode: string, password: string): Promise<void> {
  const session = await auth();
  if (!session?.user.organizationId || !session.user.email) {
    throw new UserError("Sesión inválida.");
  }

  const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
  if (!result.ok) {
    throw new UserError("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
  }
  if (!["owner", "admin"].includes(result.membership.roleCode)) {
    throw new UserError("No tienes permiso para hacer eso.");
  }
  const { membership } = result;

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = roleCode.trim();
  if (normalizedName.length < 2) throw new UserError("El nombre debe tener al menos 2 caracteres.");
  if (!normalizedEmail) throw new UserError("El correo es obligatorio.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new UserError("Ese correo no parece válido.");
  if (!INVITABLE_ROLES.includes(normalizedRole)) throw new UserError("Ese rol no es válido.");
  if (!password || password.length < 8) throw new UserError("La contraseña temporal debe tener al menos 8 caracteres.");

  // Fail fast, before touching Supabase: does this email already belong to
  // a portal account, and if so, whose?
  const existingPortalUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingPortalUser && existingPortalUser.organizationId !== session.user.organizationId) {
    throw new UserError("Ese correo ya pertenece a una cuenta de otra organización.");
  }

  const supabase = getSmartcardAdminClient();
  if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

  // Same app-level pre-check as before — the real limit is enforced by
  // Supabase's own check_limit()-backed policy on the company_users insert.
  const [{ count: currentSeats }, { data: limitValue }] = await Promise.all([
    supabase
      .from("company_users")
      .select("id", { count: "exact", head: true })
      .eq("company_id", membership.companyId)
      .in("status", ["invited", "active"]),
    supabase.rpc("check_limit", { p_company_id: membership.companyId, p_limit_key: "max_team_members" }),
  ]);

  if (limitValue !== null && (currentSeats ?? 0) >= Number(limitValue)) {
    throw new UserError("Llegaste al límite de integrantes de tu plan de SmartCard. Contacta a REYMEN para subir de plan.");
  }

  const { data: role } = await supabase.from("roles").select("id").eq("code", normalizedRole).maybeSingle();
  if (!role) throw new UserError("Ese rol no es válido.");

  // 1. Supabase Auth user: reuse if one already exists for this email (e.g.
  // added to SmartCard before, or belongs to another company too), otherwise
  // create one with a random password nobody will ever use.
  const { id: supabaseUserId, created: createdSupabaseUser } = await findOrCreateSmartcardAuthUser(
    supabase,
    normalizedEmail
  );

  // 2. company_users, active immediately — no separate activation step left
  // to depend on.
  const { error: membershipError } = await supabase.from("company_users").insert({
    company_id: membership.companyId,
    user_id: supabaseUserId,
    role_id: role.id,
    status: "active",
  });

  if (membershipError) {
    console.error("[smartcard/actions] company_users insert falló:", membershipError.message);
    if (createdSupabaseUser) {
      await supabase.auth.admin
        .deleteUser(supabaseUserId)
        .catch((e) => console.error("[smartcard/actions] No se pudo revertir el usuario huérfano de Supabase:", e));
    }
    throw new UserError("No se pudo agregar a la company. Intenta de nuevo.");
  }

  // 3. The real login: reuse the existing account if this email is already
  // part of this organization's team, otherwise create one through the
  // portal's own, already-working invite flow (same UX as "Invitar usuario"
  // in Configuración — the inviter sets a temporary password and shares it
  // with the person directly; the notification email just points at /login).
  if (!existingPortalUser) {
    try {
      await inviteTeamMember({
        name: normalizedName,
        email: normalizedEmail,
        role: SMARTCARD_ROLE_TO_USER_ROLE[normalizedRole],
        password,
      });
    } catch (portalError) {
      console.error(
        "[smartcard/actions] inviteTeamMember falló, revirtiendo company_users/auth de Supabase:",
        portalError
      );
      await supabase.from("company_users").delete().eq("company_id", membership.companyId).eq("user_id", supabaseUserId);
      if (createdSupabaseUser) {
        await supabase.auth.admin.deleteUser(supabaseUserId).catch(() => {});
      }
      throw portalError instanceof Error ? portalError : new Error("No se pudo crear la cuenta del portal.");
    }
  }
}

export type UpdateCardDestinationResult = { success: true } | { success: false; error: string };

/**
 * Self-service card editing (2026-09-29): lets a company's own owner/admin
 * change where a card's QR points (destination_type + destination_url)
 * without asking Reymen to do it. Confirmed against real data (2026-09-29,
 * Villa Gardenia's 3 test cards) that every card in use then was a plain
 * URL redirect (WHATSAPP/GOOGLE_REVIEWS/CUSTOM_URL/etc, destination_types
 * .requires_url) — none used PROFILE (requires_profile, the richer
 * admin_profiles/profile_links page) — so that type was deliberately
 * rejected here rather than half-supported.
 *
 * requires_profile is STILL rejected here specifically (2026-10-07): this
 * function only ever flips destination_type/destination_url on an existing
 * card, it has no notion of attaching a profile. Switching a card INTO
 * PROFILE now goes through createSmartcardCardProfile below instead, which
 * creates the profile row and links it in one step; this function stays the
 * path for every plain redirect-only type, including switching a card OUT
 * of PROFILE back to one of those (its own profile row is just left
 * orphaned — unusual enough to not be worth handling specially yet).
 *
 * cardId is client input and this runs on the unscoped service-role client
 * (see smartcard-supabase.ts's own warning: no RLS net here), so the
 * clients!inner(company_id) join below is the ONLY thing stopping one
 * company from editing another's card — never drop it.
 */
export async function updateSmartcardCardDestination(
  cardId: string,
  destinationType: string,
  destinationUrl: string
): Promise<UpdateCardDestinationResult> {
  try {
    await run(cardId, destinationType, destinationUrl);
    revalidatePath("/portal/smartcard");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] updateSmartcardCardDestination falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }

  async function run(cardId: string, destinationType: string, destinationUrl: string): Promise<void> {
    const session = await auth();
    if (!session?.user.organizationId || !session.user.email) {
      throw new UserError("Sesión inválida.");
    }

    const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
    if (!result.ok) {
      throw new UserError("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
    }
    if (!CARD_MANAGEMENT_ROLES.includes(result.membership.roleCode)) {
      throw new UserError("No tienes permiso para editar tarjetas.");
    }

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("id, clients!inner(company_id)")
      .eq("id", cardId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; clients: { company_id: string } }>();

    if (cardError) {
      console.error("[smartcard/actions] Error buscando card:", cardError.message);
      throw new UserError("No se pudo cargar la tarjeta. Intenta de nuevo.");
    }
    if (!card || card.clients.company_id !== result.membership.companyId) {
      throw new UserError("Esa tarjeta no pertenece a tu empresa.");
    }

    const { data: type, error: typeError } = await supabase
      .from("destination_types")
      .select("code, requires_profile, requires_url")
      .eq("code", destinationType)
      .eq("is_active", true)
      .maybeSingle();

    if (typeError) {
      console.error("[smartcard/actions] Error buscando destination_type:", typeError.message);
      throw new UserError("No se pudo validar el tipo de destino. Intenta de nuevo.");
    }
    if (!type) throw new UserError("Ese tipo de destino no es válido.");
    if (type.requires_profile) {
      throw new UserError(
        "Para activar un perfil digital en esta tarjeta, usa el botón Activar perfil digital en vez de este formulario."
      );
    }

    let normalizedUrl: string | null = null;
    if (type.requires_url) {
      normalizedUrl = destinationUrl.trim();
      if (!normalizedUrl) throw new UserError("Ese tipo de destino necesita una URL.");
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        throw new UserError("La URL debe empezar con http:// o https://");
      }
    }

    const { error: updateError } = await supabase
      .from("cards")
      .update({
        destination_type: destinationType,
        destination_url: normalizedUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cardId);

    if (updateError) {
      console.error("[smartcard/actions] Error actualizando card:", updateError.message);
      throw new UserError("No se pudo guardar el cambio. Intenta de nuevo.");
    }
  }
}

// Turns a client/company name into a Postgres-safe slug base — lowercase,
// accents stripped, anything that isn't a-z0-9 collapsed to a single "-",
// no leading/trailing "-". Matches the format the DB's own check constraint
// requires (see describeProfileSaveError in smartcard-admin.ts); the DB
// still has the final say (format + reserved-word trigger + uniqueness),
// this just keeps the first attempt from failing on the obvious cases.
function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "perfil";
}

export type CreateCardProfileResult = { success: true; profileId: string } | { success: false; error: string };

/**
 * Self-service "Perfil digital" (2026-10-07, user request) — until now,
 * switching a card to PROFILE from this portal was flatly rejected (see
 * updateSmartcardCardDestination's own comment: no company had one in use
 * at the time, so it was deliberately left out rather than half-built).
 * This is the missing piece: create a blank profiles row for the card's own
 * client, point the card at it, and hand back the new profileId so the
 * caller can open SmartcardProfileDialog immediately — the same dialog an
 * existing profile-card already uses to edit itself, reused as-is here.
 *
 * Slug collisions: the DB enforces format + reserved words (a trigger) and
 * uniqueness (a unique index on active profiles) — this only needs to
 * react to those, not pre-validate them. Retries a couple of times with a
 * randomized suffix on a unique_violation/reserved-word rejection before
 * giving up; any other error (including a true network/db failure) is not
 * retried.
 */
export async function createSmartcardCardProfile(cardId: string): Promise<CreateCardProfileResult> {
  try {
    const membership = await requireCardManagementMembership();

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("id, destination_type, profile_id, client_id, clients!inner(company_id, name, business_name)")
      .eq("id", cardId)
      .is("deleted_at", null)
      .maybeSingle<{
        id: string;
        destination_type: string;
        profile_id: string | null;
        client_id: string;
        clients: { company_id: string; name: string; business_name: string | null };
      }>();

    if (cardError) {
      console.error("[smartcard/actions] Error buscando card para crear perfil:", cardError.message);
      throw new UserError("No se pudo cargar la tarjeta. Intenta de nuevo.");
    }
    if (!card || card.clients.company_id !== membership.companyId) {
      throw new UserError("Esa tarjeta no pertenece a tu empresa.");
    }
    if (card.destination_type === "PROFILE" && card.profile_id) {
      throw new UserError("Esta tarjeta ya tiene un perfil digital asignado.");
    }

    const { data: type, error: typeError } = await supabase
      .from("destination_types")
      .select("code, requires_profile")
      .eq("code", "PROFILE")
      .eq("is_active", true)
      .maybeSingle();
    if (typeError) {
      console.error("[smartcard/actions] Error validando destination_type PROFILE:", typeError.message);
      throw new UserError("No se pudo validar el tipo de destino. Intenta de nuevo.");
    }
    if (!type || !type.requires_profile) {
      throw new UserError("El destino de perfil digital no está disponible en este momento.");
    }

    const baseName = (card.clients.business_name || card.clients.name || "Perfil").trim();
    const baseSlug = slugify(baseName);

    let profileId: string | null = null;
    let lastError: { message: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const suffix =
        attempt === 0 ? cardId.replace(/-/g, "").slice(0, 8) : Math.random().toString(36).slice(2, 8);
      const candidateSlug = `${baseSlug}-${suffix}`.slice(0, 60).replace(/-+$/g, "");

      const { data: created, error } = await supabase
        .from("profiles")
        .insert({
          client_id: card.client_id,
          slug: candidateSlug,
          display_name: baseName,
          status: "ACTIVE",
          is_noindex: false,
        })
        .select("id")
        .single();

      if (created) {
        profileId = created.id as string;
        break;
      }
      lastError = error;
      // 23505 = unique_violation (slug ya usado), 23514/P0001 = formato o
      // palabra reservada — en cualquier otro código no vale la pena
      // reintentar con otro slug, el problema no es el slug.
      if (error?.code !== "23505" && error?.code !== "23514" && error?.code !== "P0001") break;
    }

    if (!profileId) {
      console.error("[smartcard/actions] Error creando profile para card:", lastError?.message);
      throw new UserError("No se pudo crear el perfil digital. Intenta de nuevo.");
    }

    const { error: updateError } = await supabase
      .from("cards")
      .update({
        destination_type: "PROFILE",
        destination_url: null,
        profile_id: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cardId);

    if (updateError) {
      console.error("[smartcard/actions] Error vinculando profile recién creado a card:", updateError.message);
      // Best-effort: no dejar un profile huérfano activo si no se pudo
      // enlazar — se da de baja igual que softDeleteSmartcardAdminProfile.
      await supabase.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", profileId);
      throw new UserError("No se pudo activar el perfil digital en la tarjeta. Intenta de nuevo.");
    }

    revalidatePath("/portal/smartcard");
    return { success: true, profileId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el perfil digital. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] createSmartcardCardProfile falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

export type SmartcardCardQrResult =
  | { success: true; dataUrl: string; url: string }
  | { success: false; error: string };

/**
 * Generates a downloadable QR (PNG data URL) for a card's public scan URL
 * — buildSmartcardPublicUrl (link.reymen.mx/q/{card_code}), confirmed
 * 2026-09-29 against a real live card. Same company-scoping check as
 * updateSmartcardCardDestination (cardId is client input on the unscoped
 * service-role client — never skip the clients!inner(company_id) join),
 * same CARD_MANAGEMENT_ROLES permission.
 */
export async function getSmartcardCardQrCode(cardId: string): Promise<SmartcardCardQrResult> {
  try {
    const session = await auth();
    if (!session?.user.organizationId || !session.user.email) {
      throw new UserError("Sesión inválida.");
    }

    const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);
    if (!result.ok) {
      throw new UserError("No se pudo confirmar tu membresía en SmartCard. Recarga la página e intenta de nuevo.");
    }
    if (
      !CARD_MANAGEMENT_ROLES.includes(result.membership.roleCode) &&
      !(await isAssignedTo("id", cardId, result.membership.userId))
    ) {
      throw new UserError("No tienes permiso para descargar el QR de esta tarjeta.");
    }

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("id, card_code, clients!inner(company_id)")
      .eq("id", cardId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; card_code: string | null; clients: { company_id: string } }>();

    if (cardError) {
      console.error("[smartcard/actions] Error buscando card para QR:", cardError.message);
      throw new UserError("No se pudo cargar la tarjeta. Intenta de nuevo.");
    }
    if (!card || card.clients.company_id !== result.membership.companyId) {
      throw new UserError("Esa tarjeta no pertenece a tu empresa.");
    }
    if (!card.card_code) {
      throw new UserError("Esta tarjeta todavía no tiene un código asignado.");
    }

    const url = buildSmartcardPublicUrl(card.card_code);
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 });

    return { success: true, dataUrl, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo generar el QR. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] getSmartcardCardQrCode falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

type SmartcardActionResult = { success: true } | { success: false; error: string };

export type SmartcardProfileResult =
  | {
      success: true;
      profile: SmartcardProfile;
      links: ProfileLink[];
      theme: ProfileThemeInfo | null;
      /** false para un asesor: el diseño y el logo los fija la empresa. */
      canEditDesign: boolean;
    }
  | { success: false; error: string };

/** Loads a card's linked profile (destination_type PROFILE) for editing. */
export async function getSmartcardProfileForEdit(profileId: string): Promise<SmartcardProfileResult> {
  try {
    const { membership, existing: result, isManager } = await requireProfileEditor(profileId);
    const theme = await getProfileThemeInfo(profileId, membership.companyId);
    return { success: true, profile: result.profile, links: result.links, theme, canEditDesign: isManager };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar el perfil. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] getSmartcardProfileForEdit falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

export type SmartcardProfileInput = Omit<SmartcardProfile, "id">;

// Fields that must look like a URL when non-empty — phone/whatsapp are free
// text (the real data has spaces, "+52...", etc.), so deliberately excluded.
const PROFILE_URL_FIELDS: (keyof SmartcardProfileInput)[] = [
  "photoUrl",
  "logoUrl",
  "website",
  "mapsUrl",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
];

// primaryColor/accentColor deliberadamente NO están aquí — no son columnas
// directas, viven en el jsonb theme_overrides (ver updateProfileThemeColors
// en smartcard-company.ts) y se guardan aparte, después del update de
// abajo. Partial porque de otro modo TS exige una entrada por cada campo de
// SmartcardProfileInput, incluidos esos dos.
const PROFILE_FIELD_TO_COLUMN: Partial<Record<keyof SmartcardProfileInput, string>> = {
  displayName: "display_name",
  firstName: "first_name",
  lastName: "last_name",
  jobTitle: "job_title",
  company: "company",
  bio: "bio",
  photoUrl: "photo_url",
  logoUrl: "logo_url",
  phone: "phone",
  whatsapp: "whatsapp",
  email: "email",
  website: "website",
  address: "address",
  mapsUrl: "maps_url",
  instagram: "instagram",
  facebook: "facebook",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
};

/**
 * Updates the editable subset of a profile — see getSmartcardProfile's own
 * comment for exactly what's excluded (slug/status/is_noindex/theme_id) and
 * why. photoUrl/logoUrl are plain URL-paste fields here, matching
 * admin.reymen.mx's own fallback path ("También se puede pegar aquí la URL
 * de una imagen ya alojada en otro lugar") — real file upload to the
 * profile-media storage bucket is separate, bigger scope, deliberately not
 * built this round.
 *
 * primaryColor/accentColor (2026-10-06, "tema básico") are validated here
 * (must be #RRGGBB or empty) but saved via updateProfileThemeColors, not
 * the generic column update above — they're two keys inside the
 * theme_overrides jsonb, not their own columns. Deliberately not blocking
 * on low contrast between them: that's a design choice, surfaced to the
 * person as a warning in the dialog (see passesWcagAA), not a hard error
 * here — same reasoning as reymen-smartcard's own admin theme form.
 */
export async function updateSmartcardProfile(
  profileId: string,
  input: SmartcardProfileInput
): Promise<SmartcardActionResult> {
  try {
    const { membership, isManager } = await requireProfileEditor(profileId);

    const displayName = input.displayName.trim();
    if (!displayName) throw new Error("El nombre a mostrar es obligatorio.");

    const update: Record<string, string | null> = { display_name: displayName };
    for (const [field, column] of Object.entries(PROFILE_FIELD_TO_COLUMN) as [
      keyof SmartcardProfileInput,
      string,
    ][]) {
      if (field === "displayName") continue;
      const raw = input[field];
      const value = typeof raw === "string" ? raw.trim() : raw;
      if (value && PROFILE_URL_FIELDS.includes(field) && !/^https?:\/\//i.test(value)) {
        throw new Error(`"${value}" no parece una URL válida (debe empezar con http:// o https://).`);
      }
      update[column] = value || null;
    }
    // El logo es de la empresa: un asesor no lo cambia desde su perfil.
    if (!isManager) delete update.logo_url;

    const primaryColor = (input.primaryColor ?? "").trim();
    const accentColor = (input.accentColor ?? "").trim();
    if (primaryColor && !HEX_COLOR.test(primaryColor)) {
      throw new Error(`"${primaryColor}" no es un color válido (formato #RRGGBB).`);
    }
    if (accentColor && !HEX_COLOR.test(accentColor)) {
      throw new Error(`"${accentColor}" no es un color válido (formato #RRGGBB).`);
    }

    const backgroundColor = (input.backgroundColor ?? "").trim();
    if (backgroundColor && !HEX_COLOR.test(backgroundColor)) {
      throw new Error(`"${backgroundColor}" no es un color válido (formato #RRGGBB).`);
    }

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new Error("SmartCard aún no está configurado en este entorno.");

    const { error } = await supabase
      .from("profiles")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", profileId);

    if (error) {
      console.error("[smartcard/actions] Error actualizando profile:", error.message);
      throw new Error("No se pudo guardar el perfil. Intenta de nuevo.");
    }

    if (isManager) {
      const themeResult = await updateProfileThemeColors(profileId, membership.companyId, {
        primaryColor: primaryColor || null,
        accentColor: accentColor || null,
        backgroundColor: backgroundColor || null,
      });
      if (!themeResult.ok) throw new Error(themeResult.error);
    }

    revalidatePath("/portal/smartcard");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el perfil. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] updateSmartcardProfile falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

export type SaveProfileLinkResult = { success: true; linkId: string } | { success: false; error: string };

/**
 * Creates a new profile_links row, or updates one when link.id is given —
 * re-verifies that id against profileId first (client input, same reasoning
 * as every other cardId/profileId check in this file). New links go last
 * (max existing sort_order + 1); icon/type are left null, matching the
 * admin form's own "Ícono Genérico (por default)" default.
 */
export async function saveProfileLink(
  profileId: string,
  link: { id?: string; title: string; url: string; icon?: string | null }
): Promise<SaveProfileLinkResult> {
  try {
    const { existing } = await requireProfileEditor(profileId);

    const title = link.title.trim();
    const url = link.url.trim();
    const icon = link.icon && isValidLinkIcon(link.icon) ? link.icon : null;
    if (!title) throw new Error("El link necesita un título.");
    if (!/^https?:\/\//i.test(url)) throw new Error("La URL debe empezar con http:// o https://");

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new Error("SmartCard aún no está configurado en este entorno.");

    if (link.id) {
      const { data: current } = await supabase
        .from("profile_links")
        .select("id")
        .eq("id", link.id)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (!current) throw new Error("Ese link no pertenece a este perfil.");

      const { error } = await supabase
        .from("profile_links")
        .update({ title, url, icon, updated_at: new Date().toISOString() })
        .eq("id", link.id);
      if (error) {
        console.error("[smartcard/actions] Error actualizando profile_link:", error.message);
        throw new Error("No se pudo guardar el link. Intenta de nuevo.");
      }
      revalidatePath("/portal/smartcard");
      return { success: true, linkId: link.id };
    }

    const nextSortOrder = existing.links.length > 0 ? Math.max(...existing.links.map((l) => l.sortOrder)) + 1 : 0;
    const { data: created, error } = await supabase
      .from("profile_links")
      .insert({ profile_id: profileId, title, url, icon, sort_order: nextSortOrder, is_active: true })
      .select("id")
      .single();

    if (error || !created) {
      console.error("[smartcard/actions] Error creando profile_link:", error?.message);
      throw new Error("No se pudo agregar el link. Intenta de nuevo.");
    }
    revalidatePath("/portal/smartcard");
    return { success: true, linkId: created.id as string };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el link. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] saveProfileLink falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

/**
 * Soft-deletes a link (is_active = false), matching this table's own
 * "Desactivar" affordance in admin.reymen.mx rather than a hard delete —
 * self-service gets a safer default than REYMEN's own admin tool does.
 */
export async function deleteProfileLink(linkId: string, profileId: string): Promise<SmartcardActionResult> {
  try {
    await requireProfileEditor(profileId);

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new Error("SmartCard aún no está configurado en este entorno.");

    const { data: current } = await supabase
      .from("profile_links")
      .select("id")
      .eq("id", linkId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!current) throw new Error("Ese link no pertenece a este perfil.");

    const { error } = await supabase
      .from("profile_links")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", linkId);

    if (error) {
      console.error("[smartcard/actions] Error eliminando profile_link:", error.message);
      throw new Error("No se pudo eliminar el link. Intenta de nuevo.");
    }
    revalidatePath("/portal/smartcard");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar el link. Intenta de nuevo.";
    if (!(err instanceof Error)) {
      console.error("[smartcard/actions] deleteProfileLink falló con un valor no-Error:", err);
    }
    return { success: false, error: message };
  }
}

// ─── Productos en el perfil (catálogo de los módulos) ────────────────────
// Ver src/lib/smartcard-products.ts (cómo se guardan) y src/lib/catalog
// (de dónde salen: Real Estate hoy, cualquier módulo que registre su fuente).

export type CatalogPickerGroup = {
  key: string;
  label: string;
  items: { ref: string; title: string; subtitle: string | null; priceLabel: string | null; imageUrl: string | null }[];
};

export type ProfileProductsResult =
  | { success: true; products: ProfileProduct[]; ready: boolean }
  | { success: false; error: string };

async function requireProductEditor(profileId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("Sesión inválida.");
  await requireProfileEditor(profileId);
  return { organizationId: session.user.organizationId };
}

/** Productos del perfil. `ready: false` = falta la migración de productos en SmartCard. */
export async function getProfileProducts(profileId: string): Promise<ProfileProductsResult> {
  try {
    await requireProductEditor(profileId);
    const products = await listProfileProducts(profileId);
    return { success: true, products: products ?? [], ready: products !== null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudieron cargar los productos." };
  }
}

/** Productos que se pueden agregar, agrupados por módulo (solo los módulos activos). */
export async function listSmartcardCatalog(query: string, lang: "es" | "en" = "es"): Promise<CatalogPickerGroup[]> {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("Sesión inválida.");
  await requireMembership();
  const groups = await listCatalog(session.user.organizationId, query.slice(0, 80));
  return groups.map((g) => ({
    key: g.key,
    label: g.label[lang],
    items: g.items.map((i) => ({ ref: i.ref, title: i.title, subtitle: i.subtitle, priceLabel: i.priceLabel, imageUrl: i.imageUrl })),
  }));
}

/**
 * Agrega un producto al perfil. El cliente solo manda el ref: título, precio,
 * foto y URL se leen aquí del módulo dueño (nunca se confía en lo que mande
 * el navegador), y solo si el producto es de esta organización y está disponible.
 */
export async function addProfileProduct(profileId: string, ref: string): Promise<{ success: true; product: ProfileProduct } | { success: false; error: string }> {
  try {
    const { organizationId } = await requireProductEditor(profileId);
    const item = await resolveCatalogItem(organizationId, ref);
    if (!item) throw new UserError("Ese producto no existe o su módulo no está activo.");
    if (!item.available) throw new UserError("Ese producto no está disponible (no publicado, vendido o rentado).");

    const current = await listProfileProducts(profileId);
    if (current === null) throw new UserError("Los productos todavía no están habilitados en SmartCard. Contacta a soporte de Reymen.");
    if (current.some((p) => p.ref === item.ref)) throw new UserError("Ese producto ya está en el perfil.");
    if (current.length >= MAX_PROFILE_PRODUCTS) throw new UserError("Máximo 12 productos por perfil."); // = MAX_PROFILE_PRODUCTS

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");
    const sortOrder = current.length > 0 ? Math.max(...current.map((p) => p.sortOrder)) + 1 : 0;
    const cols = productColumns(item);
    const { data, error } = await supabase
      .from("profile_links")
      .insert({ profile_id: profileId, type: PRODUCT_LINK_TYPE, source_ref: item.ref, sort_order: sortOrder, is_active: true, ...cols })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[smartcard/actions] Error agregando producto:", error?.message);
      throw new UserError("No se pudo agregar el producto. Intenta de nuevo.");
    }
    revalidatePath("/portal/smartcard");
    return {
      success: true,
      product: { id: data.id as string, ref: item.ref, title: cols.title, subtitle: cols.subtitle, priceLabel: cols.price_label, imageUrl: cols.image_url, url: cols.url, sortOrder },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudo agregar el producto." };
  }
}

export interface ManualProductInput {
  title: string;
  /** Texto libre tal como se verá ("$890 MXN"). */
  priceLabel?: string;
  /** Enlace de compra (tienda, Mercado Libre, WhatsApp...). */
  url: string;
  imageUrl?: string;
  characteristics?: string[];
}

/**
 * Agrega un producto escrito a mano (tiendas en línea que no tienen un módulo
 * de catálogo, ej. un e-commerce de sérums). Se guarda como los demás
 * productos (profile_links type = 'product') pero sin source_ref, así que
 * ninguna sincronización lo toca ni lo oculta.
 */
export async function addManualProfileProduct(
  profileId: string,
  input: ManualProductInput
): Promise<{ success: true; product: ProfileProduct } | { success: false; error: string }> {
  try {
    await requireProductEditor(profileId);
    const title = input.title.trim().slice(0, 140);
    const url = input.url.trim();
    const imageUrl = (input.imageUrl ?? "").trim();
    if (!title) throw new UserError("El producto necesita un nombre.");
    if (!/^https?:\/\//i.test(url)) throw new UserError("El enlace del producto debe empezar con http:// o https://");
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new UserError("La URL de la foto debe empezar con https://");

    const current = await listProfileProducts(profileId);
    if (current === null) throw new UserError("Los productos todavía no están habilitados en SmartCard. Contacta a soporte de Reymen.");
    if (current.length >= MAX_PROFILE_PRODUCTS) throw new UserError("Máximo 12 productos por perfil.");

    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");
    const sortOrder = current.length > 0 ? Math.max(...current.map((p) => p.sortOrder)) + 1 : 0;
    const cols = {
      title,
      url,
      subtitle: characteristicsToSubtitle(input.characteristics ?? []),
      price_label: input.priceLabel?.trim().slice(0, 60) || null,
      image_url: imageUrl || null,
    };
    const { data, error } = await supabase
      .from("profile_links")
      .insert({ profile_id: profileId, type: PRODUCT_LINK_TYPE, source_ref: null, sort_order: sortOrder, is_active: true, ...cols })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[smartcard/actions] Error agregando producto manual:", error?.message);
      throw new UserError("No se pudo agregar el producto. Intenta de nuevo.");
    }
    revalidatePath("/portal/smartcard");
    return {
      success: true,
      product: { id: data.id as string, ref: null, title, subtitle: cols.subtitle, priceLabel: cols.price_label, imageUrl: cols.image_url, url, sortOrder },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudo agregar el producto." };
  }
}

/** Cambia el tema (diseño y colores base) de la tarjeta a otro del catálogo. */
export async function updateSmartcardProfileTheme(profileId: string, themeId: string): Promise<SmartcardActionResult> {
  try {
    const membership = await requireCardManagementMembership();
    const ok = await setProfileTheme(profileId, membership.companyId, themeId);
    if (!ok) throw new UserError("No se pudo cambiar el tema de esta tarjeta.");
    revalidatePath("/portal/smartcard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudo cambiar el tema de esta tarjeta." };
  }
}

// ─── Tarjetas por persona ─────────────────────────────────────────────

export type CreateMemberCardResult =
  | { success: true; cardCode: string | null; profileId: string }
  | { success: false; error: string };

const NEEDS_MIGRATION = "Para tarjetas por persona falta un ajuste en SmartCard. Avisa a soporte de Reymen.";

/** Integrante activo de la empresa (por su user_id de SmartCard), o error. */
async function requireActiveMember(companyId: string, memberUserId: string) {
  const supabase = getSmartcardAdminClient();
  if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");
  const { data: member } = await supabase
    .from("company_users")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", memberUserId)
    .eq("status", "active")
    .maybeSingle();
  if (!member) throw new UserError("Esa persona no es integrante activo de tu empresa en SmartCard.");
  return supabase;
}

/**
 * Crea la tarjeta de un integrante (dueño, administrador o gerente): su
 * perfil digital con su nombre y correo, con el diseño y el logo que ya usa
 * la empresa, y la tarjeta asignada a esa persona. Una tarjeta por persona.
 * La tarjeta queda colgada del titular de la empresa en SmartCard (se crea
 * si la empresa todavía no tiene uno).
 */
export async function createSmartcardCardForMember(memberUserId: string): Promise<CreateMemberCardResult> {
  try {
    const membership = await requireCardManagementMembership();
    const session = await auth();
    if (!session?.user.organizationId) throw new UserError("Sesión inválida.");
    if (!(await supportsCardAssignment())) throw new UserError(NEEDS_MIGRATION);
    const supabase = await requireActiveMember(membership.companyId, memberUserId);

    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id")
      .eq("company_id", membership.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (clientsError) throw new UserError("No se pudo cargar tu empresa en SmartCard. Intenta de nuevo.");
    const clientIds = (clients ?? []).map((c) => c.id as string);

    if (clientIds.length) {
      const { data: taken } = await supabase
        .from("cards")
        .select("id")
        .in("client_id", clientIds)
        .eq("assigned_user_id", memberUserId)
        .is("deleted_at", null)
        .limit(1);
      if (taken?.length) throw new UserError("Esa persona ya tiene su tarjeta.");
    }

    let clientId = clientIds[0];
    if (!clientId) {
      const { data: created, error } = await supabase
        .from("clients")
        .insert({ name: membership.companyName, business_name: membership.companyName, status: "ACTIVE", company_id: membership.companyId })
        .select("id")
        .single();
      if (!created) {
        console.error("[smartcard/actions] Error creando titular de la empresa:", error?.message);
        throw new UserError("No se pudo preparar tu empresa en SmartCard. Intenta de nuevo.");
      }
      clientId = created.id as string;
    }

    // El diseño y el logo de la empresa: los del perfil más reciente que ya tenga.
    const { data: look } = await supabase
      .from("profiles")
      .select("theme_id, theme_overrides, logo_url")
      .in("client_id", clientIds.length ? clientIds : [clientId])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const person = (await getRosterPeople(session.user.organizationId, [memberUserId]))[memberUserId];
    const displayName = (person?.name || person?.email?.split("@")[0] || "Integrante").trim();
    const baseSlug = slugify(displayName);

    let profileId: string | null = null;
    for (let attempt = 0; attempt < 3 && !profileId; attempt++) {
      const suffix = attempt === 0 ? memberUserId.replace(/-/g, "").slice(0, 6) : Math.random().toString(36).slice(2, 8);
      const { data: created, error } = await supabase
        .from("profiles")
        .insert({
          client_id: clientId,
          slug: `${baseSlug}-${suffix}`.slice(0, 60).replace(/-+$/g, ""),
          display_name: displayName,
          email: person?.email ?? null,
          company: membership.companyName,
          logo_url: look?.logo_url ?? null,
          theme_id: look?.theme_id ?? null,
          theme_overrides: look?.theme_overrides ?? {},
          status: "ACTIVE",
          is_noindex: false,
        })
        .select("id")
        .single();
      if (created) profileId = created.id as string;
      else if (error?.code !== "23505" && error?.code !== "23514" && error?.code !== "P0001") {
        console.error("[smartcard/actions] Error creando perfil del integrante:", error?.message);
        break;
      }
    }
    if (!profileId) throw new UserError("No se pudo crear el perfil digital. Intenta de nuevo.");

    const { data: card, error: cardError } = await supabase
      .from("cards")
      .insert({ client_id: clientId, profile_id: profileId, destination_type: "PROFILE", status: "ACTIVE", assigned_user_id: memberUserId })
      .select("id, card_code")
      .single();
    if (!card) {
      console.error("[smartcard/actions] Error creando la tarjeta del integrante:", cardError?.message);
      await supabase.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", profileId);
      throw new UserError("No se pudo crear la tarjeta. Intenta de nuevo.");
    }

    revalidatePath("/portal/smartcard");
    return { success: true, cardCode: (card.card_code as string | null) ?? null, profileId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudo crear la tarjeta. Intenta de nuevo." };
  }
}

/**
 * Asigna una tarjeta de la empresa a un integrante, o la deja sin asignar
 * (memberUserId null). Solo dueño, administrador o gerente.
 */
export async function assignSmartcardCard(cardId: string, memberUserId: string | null): Promise<SmartcardActionResult> {
  try {
    const membership = await requireCardManagementMembership();
    if (!(await supportsCardAssignment())) throw new UserError(NEEDS_MIGRATION);
    const supabase = getSmartcardAdminClient();
    if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");

    const { data: card } = await supabase
      .from("cards")
      .select("id, clients!inner(company_id)")
      .eq("id", cardId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; clients: { company_id: string } }>();
    if (!card || card.clients.company_id !== membership.companyId) throw new UserError("Esa tarjeta no pertenece a tu empresa.");
    if (memberUserId) await requireActiveMember(membership.companyId, memberUserId);

    const { error } = await supabase
      .from("cards")
      .update({ assigned_user_id: memberUserId, updated_at: new Date().toISOString() })
      .eq("id", cardId);
    if (error) {
      console.error("[smartcard/actions] Error asignando tarjeta:", error.message);
      throw new UserError("No se pudo asignar la tarjeta. Intenta de nuevo.");
    }
    revalidatePath("/portal/smartcard");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudo asignar la tarjeta. Intenta de nuevo." };
  }
}

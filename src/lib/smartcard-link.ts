import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSmartcardAdminClient } from "./smartcard-supabase";
import { prisma } from "./prisma";
import { getPlan } from "./plans";
import { UserError } from "./user-error";
import type {
  SmartcardCompanyLink,
  SmartcardCompanyOption,
  SmartcardCompanyRow,
  SmartcardLinkRole,
  SmartcardLinkState,
} from "./smartcard-link-shared";

/**
 * Vinculación de un cliente de Reymen con su empresa en SmartCard, para
 * hacerla desde Admin → Clientes en lugar del admin de SmartCard. Es lo que
 * resolveSmartcardMembership (smartcard-company.ts) necesita para mostrar el
 * panel: companies.external_org_id = id del cliente, y el correo con el que
 * entra la persona como miembro activo (company_users) de esa empresa.
 *
 * Corre con la llave de servicio (sin RLS): cada consulta filtra por
 * empresa o usuario de forma explícita.
 */

function requireClient(): SupabaseClient {
  const supabase = getSmartcardAdminClient();
  if (!supabase) throw new UserError("SmartCard aún no está configurado en este entorno.");
  return supabase;
}

export async function getSmartcardLinkState(organizationId: string): Promise<SmartcardLinkState> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { status: "not_configured" };

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("[smartcard-link] Error buscando company:", error.message);
    return { status: "error" };
  }

  if (!company) {
    const companies = await listCompaniesWithLink(supabase);
    if (!companies) return { status: "error" };
    return {
      status: "unlinked",
      candidates: companies
        .filter((c) => c.link.kind !== "client")
        .map((c) => ({ id: c.id, name: c.name, slug: c.slug, staleOrgId: c.link.kind === "stale" ? c.link.orgId : null })),
      taken: companies.flatMap((c) =>
        c.link.kind === "client"
          ? [{ id: c.id, name: c.name, slug: c.slug, clientId: c.link.clientId, clientName: c.link.clientName }]
          : []
      ),
    };
  }

  const [{ data: rows, error: membersError }, { data: roles }] = await Promise.all([
    supabase
      .from("company_users")
      .select("id, user_id, role_id, status")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true }),
    supabase.from("roles").select("id, code"),
  ]);
  if (membersError) {
    console.error("[smartcard-link] Error listando company_users:", membersError.message);
    return { status: "error" };
  }

  const roleCodeById = new Map((roles ?? []).map((r) => [r.id as string, r.code as string]));
  const members = await Promise.all(
    (rows ?? []).map(async (m) => {
      const { data } = await supabase.auth.admin.getUserById(m.user_id);
      return {
        id: m.id as string,
        email: data?.user?.email?.toLowerCase() ?? null,
        roleCode: roleCodeById.get(m.role_id) ?? String(m.role_id),
        status: m.status as string,
      };
    })
  );
  const scModule = await getSmartcardModuleRow(supabase, company.id);
  const memberLimit = scModule ? readMemberLimit(scModule.limits) : undefined;
  return { status: "linked", company, members, memberLimit };
}

/**
 * Todas las empresas de SmartCard con su vínculo en Reymen: libre, ligada a
 * un cliente, o "rota" (external_org_id apunta a un ID que no existe aquí,
 * p. ej. un cliente borrado o de otro entorno). null si falla la consulta.
 */
async function listCompaniesWithLink(
  supabase: SupabaseClient
): Promise<{ id: string; name: string; slug: string; link: SmartcardCompanyLink }[] | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, external_org_id")
    .order("name", { ascending: true });
  if (error) {
    console.error("[smartcard-link] Error listando companies:", error.message);
    return null;
  }
  const orgIds = [...new Set((data ?? []).map((c) => c.external_org_id as string | null).filter((v): v is string => !!v))];
  const orgs = orgIds.length
    ? await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  return (data ?? []).map((c) => {
    const orgId = c.external_org_id as string | null;
    const link: SmartcardCompanyLink = !orgId
      ? { kind: "none" }
      : orgName.has(orgId)
        ? { kind: "client", clientId: orgId, clientName: orgName.get(orgId)! }
        : { kind: "stale", orgId };
    return { id: c.id as string, name: c.name as string, slug: c.slug as string, link };
  });
}

/** Resumen de todas las empresas de SmartCard para Admin → SmartCard. */
export async function listSmartcardCompanies(): Promise<SmartcardCompanyRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;
  const companies = await listCompaniesWithLink(supabase);
  if (!companies) return null;

  const [{ data: members }, { data: clients }, { data: cards }] = await Promise.all([
    supabase.from("company_users").select("company_id").eq("status", "active"),
    supabase.from("clients").select("id, company_id"),
    supabase.from("cards").select("client_id").is("deleted_at", null),
  ]);
  const count = (keys: (string | undefined)[]) => {
    const m = new Map<string, number>();
    for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const membersBy = count((members ?? []).map((m) => m.company_id as string));
  const companyByClient = new Map((clients ?? []).map((c) => [c.id as string, c.company_id as string]));
  const cardsBy = count((cards ?? []).map((c) => companyByClient.get(c.client_id as string)));

  return companies.map((c) => ({ ...c, activeMembers: membersBy.get(c.id) ?? 0, cards: cardsBy.get(c.id) ?? 0 }));
}

/**
 * Liga una empresa de SmartCard al cliente. Solo si está libre o si su
 * vínculo está roto (apunta a un ID que no existe en Reymen); nunca se le
 * quita a otro cliente.
 */
export async function linkSmartcardCompany(organizationId: string, companyId: string): Promise<SmartcardCompanyOption> {
  const supabase = requireClient();

  const { data: current } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (current) throw new UserError("Este cliente ya está vinculado con una empresa de SmartCard.");

  const { data: target } = await supabase
    .from("companies")
    .select("id, external_org_id")
    .eq("id", companyId)
    .maybeSingle();
  if (!target) throw new UserError("Esa empresa ya no está disponible: otro cliente la tiene vinculada.");
  const previous = (target.external_org_id as string | null) ?? null;
  if (previous) {
    const owner = await prisma.organization.findUnique({ where: { id: previous }, select: { id: true } });
    if (owner) throw new UserError("Esa empresa ya no está disponible: otro cliente la tiene vinculada.");
  }

  // Solo si nadie la cambió mientras tanto (mismo valor que se revisó arriba).
  let update = supabase.from("companies").update({ external_org_id: organizationId }).eq("id", companyId);
  update = previous ? update.eq("external_org_id", previous) : update.is("external_org_id", null);
  const { data: updated, error } = await update.select("id, name, slug").maybeSingle();
  if (error) {
    console.error("[smartcard-link] Error vinculando company:", error.message);
    throw new UserError("No se pudo vincular la empresa. Intenta de nuevo.");
  }
  if (!updated) throw new UserError("Esa empresa ya no está disponible: otro cliente la tiene vinculada.");
  return { ...updated, staleOrgId: previous };
}

/** Quita la vinculación; la empresa, sus tarjetas y miembros quedan en SmartCard. */
export async function unlinkSmartcardCompany(organizationId: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from("companies")
    .update({ external_org_id: null })
    .eq("external_org_id", organizationId);
  if (error) {
    console.error("[smartcard-link] Error desvinculando company:", error.message);
    throw new UserError("No se pudo desvincular la empresa. Intenta de nuevo.");
  }
}

/**
 * Usuario de Supabase Auth de SmartCard para ese correo: lo reutiliza si ya
 * existe o lo crea con una contraseña aleatoria que nadie usa (el acceso es
 * con la cuenta de Reymen; este usuario solo existe para company_users).
 */
export async function findOrCreateSmartcardAuthUser(
  supabase: SupabaseClient,
  email: string
): Promise<{ id: string; created: boolean }> {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: crypto.randomBytes(24).toString("hex"),
    email_confirm: true,
  });
  if (created?.user) return { id: created.user.id, created: true };

  if (createError?.message?.toLowerCase().includes("already")) {
    // admin.listUsers() paginado: el filtro por correo no es parte del
    // contrato de supabase-js.
    for (let page = 1; ; page++) {
      const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (listError || !listed?.users?.length) break;
      const match = listed.users.find((u) => u.email?.toLowerCase() === email);
      if (match) return { id: match.id, created: false };
      if (listed.users.length < 200) break;
    }
  }
  throw new UserError("No se pudo procesar la invitación. Intenta de nuevo.");
}

/**
 * Da acceso a SmartCard a un correo en la empresa vinculada al cliente:
 * crea el miembro activo, o reactiva y cambia el rol si ya existía.
 */
export async function addSmartcardMember(
  organizationId: string,
  email: string,
  roleCode: SmartcardLinkRole
): Promise<"added" | "updated"> {
  const supabase = requireClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (!company) throw new UserError("Primero vincula el cliente con una empresa de SmartCard.");

  const { data: role } = await supabase.from("roles").select("id").eq("code", roleCode).maybeSingle();
  if (!role) throw new UserError("Ese rol no es válido.");

  const user = await findOrCreateSmartcardAuthUser(supabase, normalizedEmail);

  const { data: existing } = await supabase
    .from("company_users")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("company_users")
      .update({ role_id: role.id, status: "active" })
      .eq("id", existing.id)
      .eq("company_id", company.id);
    if (error) {
      console.error("[smartcard-link] Error actualizando company_users:", error.message);
      throw new UserError("No se pudo dar acceso. Intenta de nuevo.");
    }
    return "updated";
  }

  const { error } = await supabase.from("company_users").insert({
    company_id: company.id,
    user_id: user.id,
    role_id: role.id,
    status: "active",
  });
  if (error) {
    console.error("[smartcard-link] Error insertando company_users:", error.message);
    if (user.created) {
      await supabase.auth.admin
        .deleteUser(user.id)
        .catch((e) => console.error("[smartcard-link] No se pudo revertir el usuario de Supabase:", e));
    }
    throw new UserError("No se pudo dar acceso. Revisa el límite de integrantes del plan de SmartCard.");
  }
  return "added";
}

/** Quita a un miembro de la empresa vinculada al cliente (solo de esa empresa). */
export async function removeSmartcardMember(organizationId: string, memberId: string): Promise<void> {
  const supabase = requireClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (!company) throw new UserError("Este cliente no está vinculado con SmartCard.");

  const { data: removed, error } = await supabase
    .from("company_users")
    .delete()
    .eq("id", memberId)
    .eq("company_id", company.id)
    .select("id");
  if (error) {
    console.error("[smartcard-link] Error quitando company_users:", error.message);
    throw new UserError("No se pudo quitar el acceso. Intenta de nuevo.");
  }
  if (!removed?.length) throw new UserError("Ese miembro ya no existe.");
}

/** Fila de company_modules del módulo "smartcard" de la empresa, si la tiene. */
async function getSmartcardModuleRow(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ moduleId: string; limits: Record<string, unknown> } | null> {
  const { data: mod } = await supabase.from("modules").select("id").eq("code", "smartcard").maybeSingle();
  if (!mod) return null;
  const { data: row } = await supabase
    .from("company_modules")
    .select("module_id, limits")
    .eq("company_id", companyId)
    .eq("module_id", mod.id)
    .maybeSingle();
  if (!row) return null;
  return { moduleId: row.module_id as string, limits: (row.limits as Record<string, unknown> | null) ?? {} };
}

function readMemberLimit(limits: Record<string, unknown>): number | null {
  const v = limits.max_team_members;
  return typeof v === "number" ? v : null;
}

export type MemberLimitSync = "updated" | "unchanged" | "unlinked" | "no_module" | "not_configured";

/**
 * Iguala el límite de integrantes de SmartCard (company_modules.limits
 * .max_team_members del módulo smartcard) al límite de usuarios del plan de
 * Reymen. Cada integrante de SmartCard es también usuario del portal, así que
 * el límite de Reymen es el que de verdad aplica. null = sin límite (se quita
 * la llave, como lo lee el portal). No crea el módulo si la empresa no lo tiene.
 */
export async function syncSmartcardMemberLimit(organizationId: string, limit: number | null): Promise<MemberLimitSync> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return "not_configured";
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();
  if (!company) return "unlinked";

  const row = await getSmartcardModuleRow(supabase, company.id);
  if (!row) return "no_module";
  if (readMemberLimit(row.limits) === limit) return "unchanged";

  const limits: Record<string, unknown> = { ...row.limits };
  if (limit === null) delete limits.max_team_members;
  else limits.max_team_members = limit;

  const { error } = await supabase
    .from("company_modules")
    .update({ limits })
    .eq("company_id", company.id)
    .eq("module_id", row.moduleId);
  if (error) {
    console.error("[smartcard-link] Error actualizando el límite de integrantes:", error.message);
    throw new UserError("No se pudo actualizar el límite de integrantes en SmartCard.");
  }
  return "updated";
}

/** Límite de integrantes de SmartCard que corresponde al plan de Reymen (null = sin límite). */
export async function planMemberLimit(plan: string): Promise<number | null> {
  return (await getPlan(plan)).limits.users;
}

/**
 * Igual que syncSmartcardMemberLimit con el plan actual del cliente, pero sin
 * lanzar: un problema en SmartCard no debe impedir cambiar el plan en Reymen.
 */
export async function syncSmartcardMemberLimitForPlan(organizationId: string, plan: string): Promise<MemberLimitSync | "failed"> {
  try {
    return await syncSmartcardMemberLimit(organizationId, await planMemberLimit(plan));
  } catch (e) {
    console.error("[smartcard-link] No se pudo igualar el límite de SmartCard al plan:", e);
    return "failed";
  }
}

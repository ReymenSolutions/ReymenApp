import { getSmartcardAdminClient } from "./smartcard-supabase";

export type SmartcardModuleCode = "smartcard" | "realty" | "food" | "retail" | "care";

export interface SmartcardMembership {
  companyId: string;
  companyName: string;
  companySlug: string;
  userId: string;
  roleCode: string;
  modules: SmartcardModuleCode[];
  limits: Partial<Record<SmartcardModuleCode, Record<string, unknown>>>;
}

export type ResolveMembershipResult =
  | { ok: true; membership: SmartcardMembership }
  | { ok: false; reason: "not_configured" | "no_company" | "no_membership" | "query_failed" };

/**
 * Resuelve solo el companyId de SmartCard ligado a un Organization de la
 * plataforma (companies.external_org_id), sin el resto de la resolución de
 * membresía (rol, módulos, usuario) que hace resolveSmartcardMembership --
 * agregado 2026-09-21 para el widget "SmartCard Restaurante" del dashboard
 * de Food, que muestra métricas a nivel de negocio (no las de una persona
 * en particular) y no debería fallar solo porque el usuario que ve Food no
 * tiene, además, una cuenta de SmartCard vinculada por email.
 */
export async function getSmartcardCompanyIdForOrg(organizationId: string): Promise<string | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data: company, error } = await supabase
    .from("companies")
    .select("id")
    .eq("external_org_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-company] Error buscando company (getSmartcardCompanyIdForOrg):", error.message);
    return null;
  }
  return company?.id ?? null;
}

/**
 * Organización de la plataforma ligada a una company de SmartCard (companies.external_org_id), o null
 * si no existe o aún no está vinculada. Lo usa el webhook de contactos capturados en la tarjeta.
 */
export async function getOrgIdForSmartcardCompany(companyId: string): Promise<string | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("companies").select("external_org_id").eq("id", companyId).maybeSingle();
  if (error) {
    console.error("[smartcard-company] Error buscando organización (getOrgIdForSmartcardCompany):", error.message);
    return null;
  }
  return (data?.external_org_id as string | null | undefined) ?? null;
}

/**
 * Ported from reymen-smartcard's apps/ops/lib/current-company-user.ts +
 * packages/entitlements/src/index.ts (resolveEntitlements/hasModule) —
 * that package lives in a separate monorepo and isn't published, so it
 * can't be imported directly; this duplicates its query logic instead,
 * adapted for two real differences from the original:
 *
 *   1. No Supabase Auth session here. This platform authenticates via
 *      NextAuth — "who is the current person" comes from the NextAuth
 *      session's email, matched against reymen-smartcard's Supabase Auth
 *      users by email. Same technique reymen-smartcard's own
 *      apps/ops/app/api/sso/smartcard/route.ts already uses to confirm SSO
 *      membership (getUserById over each active member, compare emails) —
 *      ported here rather than invented fresh.
 *   2. This runs on the service-role admin client (smartcard-supabase.ts),
 *      not an RLS-scoped one, so every query below filters explicitly by
 *      companyId/userId/status instead of relying on RLS to scope it. Keep
 *      every explicit filter — there is no RLS net catching a mistake here.
 *
 * Company resolution itself (companies.external_org_id) is unchanged from
 * the SSO route's own lookup — same column, same admin-created link (see
 * REYMEN Admin → companies), just queried again here instead of once per
 * SSO hop.
 */
export async function resolveSmartcardMembership(
  organizationId: string,
  email: string
): Promise<ResolveMembershipResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("external_org_id", organizationId)
    .maybeSingle();

  if (companyError) {
    console.error("[smartcard-company] Error buscando company:", companyError.message);
    return { ok: false, reason: "query_failed" };
  }
  if (!company) return { ok: false, reason: "no_company" };

  const { data: members, error: membersError } = await supabase
    .from("company_users")
    .select("user_id, role_id")
    .eq("company_id", company.id)
    .eq("status", "active");

  if (membersError) {
    console.error("[smartcard-company] Error listando company_users:", membersError.message);
    return { ok: false, reason: "query_failed" };
  }

  const targetEmail = email.toLowerCase();
  let matched: { userId: string; roleId: string } | null = null;

  for (const member of members ?? []) {
    const { data: userResponse } = await supabase.auth.admin.getUserById(member.user_id);
    if (userResponse?.user?.email?.toLowerCase() === targetEmail) {
      matched = { userId: member.user_id, roleId: member.role_id };
      break;
    }
  }

  if (!matched) return { ok: false, reason: "no_membership" };

  const [{ data: role }, { data: companyModules }] = await Promise.all([
    supabase.from("roles").select("code").eq("id", matched.roleId).maybeSingle(),
    supabase.from("company_modules").select("module_id, enabled, limits").eq("company_id", company.id),
  ]);

  const enabledModuleIds = (companyModules ?? []).filter((m) => m.enabled).map((m) => m.module_id);
  const { data: moduleRows } =
    enabledModuleIds.length > 0
      ? await supabase.from("modules").select("id, code").in("id", enabledModuleIds)
      : { data: [] as { id: string; code: string }[] };

  const moduleCodeById = new Map((moduleRows ?? []).map((m) => [m.id, m.code as SmartcardModuleCode]));
  const modules: SmartcardModuleCode[] = [];
  const limits: Partial<Record<SmartcardModuleCode, Record<string, unknown>>> = {};
  for (const row of companyModules ?? []) {
    if (!row.enabled) continue;
    const code = moduleCodeById.get(row.module_id);
    if (!code) continue;
    modules.push(code);
    limits[code] = (row.limits as Record<string, unknown>) ?? {};
  }

  return {
    ok: true,
    membership: {
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      userId: matched.userId,
      roleCode: role?.code ?? "unknown",
      modules,
      limits,
    },
  };
}

export interface CompanyRosterEntry {
  id: string;
  userId: string;
  roleCode: string;
  status: string;
  isCurrentUser: boolean;
}

/**
 * Ported from apps/ops/app/settings/page.tsx's roster query. Same privacy
 * note as the original: any active member can see the FACT of every row
 * (role, status) — RLS there restricted `user_profiles` to your own row
 * only, so other members' emails were never shown, just "Integrante". We
 * don't query emails here at all for other members, matching that on
 * purpose rather than by accident.
 */
export async function getCompanyRoster(
  companyId: string,
  currentUserId: string
): Promise<CompanyRosterEntry[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];

  const [{ data: members, error: membersError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase
      .from("company_users")
      .select("id, user_id, role_id, status")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    supabase.from("roles").select("id, code"),
  ]);

  if (membersError || rolesError) throw new Error("Unable to load SmartCard team");

  const roleCodeById = new Map((roles ?? []).map((r) => [r.id, r.code as string]));

  return (members ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    roleCode: roleCodeById.get(m.role_id) ?? m.role_id,
    status: m.status,
    isCurrentUser: m.user_id === currentUserId,
  }));
}

// The real, human-facing labels for reymen-smartcard's event_type values —
// confirmed 2026-09-21 by sampling the live events table rather than
// guessing (its schema carries no label column). Every value seen appears
// here; an event_type added later falls back to its raw code in the UI
// (see CardStatsPanel) instead of silently disappearing from the totals.
export const EVENT_TYPE_LABELS_ES: Record<string, string> = {
  qr_scan: "Escaneos QR",
  profile_view: "Vistas de perfil",
  whatsapp_click: "Clicks a WhatsApp",
  call_click: "Clicks a llamar",
  email_click: "Clicks a correo",
  facebook_click: "Clicks a Facebook",
  instagram_click: "Clicks a Instagram",
  custom_link_click: "Clicks a links personalizados",
  save_contact: "Contactos guardados",
  // Visto después en datos reales (2026-10-05): la tarjeta manda a otro link.
  external_redirect: "Redirecciones a otro link",
};

export interface CardStatsEntry {
  cardId: string;
  cardCode: string;
  status: string;
  destinationType: string;
  destinationUrl: string | null;
  profileId: string | null;
  clientName: string;
  totalEvents: number;
  byType: Record<string, number>;
  lastActivityAt: string | null;
}

/**
 * The public scan URL a card's printed/digital QR encodes — confirmed
 * 2026-09-29 against a real live card (REY-000007, Villa Gardenia's main
 * profile, screenshot from the user's own browser):
 * https://link.reymen.mx/q/{card_code}. Centralized here so QR generation
 * and anything else needing it share one source of truth for the
 * domain/path, instead of guessing it again in each caller.
 */
export function buildSmartcardPublicUrl(cardCode: string): string {
  // SMARTCARD_PUBLIC_URL permite cambiar el dominio de las tarjetas sin tocar
  // código; sin la variable se usa el dominio que ya imprimen las tarjetas.
  const base = (process.env.SMARTCARD_PUBLIC_URL?.trim() || "https://link.reymen.mx").replace(/\/+$/, "");
  return `${base}/q/${encodeURIComponent(cardCode)}`;
}

export interface DestinationTypeOption {
  code: string;
  label: string;
  requiresProfile: boolean;
  requiresUrl: boolean;
}

/**
 * The catalog cards.destination_type points into (see destination_types
 * table) — global, not scoped per company. Drives both the edit form's
 * dropdown and its validation (updateSmartcardCardDestination re-checks
 * requires_url/requires_profile server-side, never trusts the client for
 * that). Added 2026-09-29 for self-service card editing.
 */
export async function getActiveDestinationTypes({ throwOnError = false }: { throwOnError?: boolean } = {}): Promise<DestinationTypeOption[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("destination_types")
    .select("code, label, requires_profile, requires_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[smartcard-company] Error listando destination_types:", error.message);
    if (throwOnError) throw new Error("Unable to load SmartCard destinations");
    return [];
  }

  return (data ?? []).map((d) => ({
    code: d.code as string,
    label: d.label as string,
    requiresProfile: d.requires_profile as boolean,
    requiresUrl: d.requires_url as boolean,
  }));
}

export interface CompanyCardStats {
  totalCards: number;
  totalEvents: number;
  byType: Record<string, number>;
  cards: CardStatsEntry[];
}

const EMPTY_STATS: CompanyCardStats = { totalCards: 0, totalEvents: 0, byType: {}, cards: [] };

/**
 * SmartCard's actual reason for existing (per the user, 2026-09-21) — how
 * each issued card is performing: scans, profile views, and clicks per
 * channel. reymen-smartcard's own dashboard never built this (its
 * app/dashboard/page.tsx literally says "llega en la Fase 2"), so there's
 * nothing to port — this queries the raw tables directly:
 * clients (company_id) -> cards (client_id) -> events (card_id), same
 * company_id -> clients chain company_modules/company_users already use.
 *
 * PostgREST has no GROUP BY, so the per-type/per-card breakdown is done in
 * application code over the raw event rows rather than in SQL. Capped at
 * 5000 events (ordered newest-first) as a sanity limit for this early
 * stage of the product — worth moving to a real aggregate (a view, or a
 * dedicated RPC like the existing check_limit/log_event ones) well before
 * any single company gets close to that many real events.
 *
 * is_bot rows are excluded — that flag exists in the schema specifically
 * to keep non-human traffic out of stats like these.
 */
export async function getCompanyCardStats(companyId: string, { throwOnError = false }: { throwOnError?: boolean } = {}): Promise<CompanyCardStats> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) {
    if (throwOnError) throw new Error("SmartCard is not configured");
    return EMPTY_STATS;
  }

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, business_name")
    .eq("company_id", companyId);
  if (clientsError) {
    console.error("[smartcard-company] Error listando clients:", clientsError.message);
    if (throwOnError) throw new Error("Unable to load SmartCard statistics");
    return EMPTY_STATS;
  }
  if (!clients?.length) return EMPTY_STATS;

  const clientIds = clients.map((c) => c.id);
  const clientNameById = new Map(clients.map((c) => [c.id, c.business_name || c.name]));

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id, card_code, status, destination_type, destination_url, profile_id, client_id")
    .in("client_id", clientIds)
    .is("deleted_at", null);
  if (cardsError) {
    console.error("[smartcard-company] Error listando cards:", cardsError.message);
    if (throwOnError) throw new Error("Unable to load SmartCard statistics");
    return EMPTY_STATS;
  }
  if (!cards?.length) return { ...EMPTY_STATS, totalCards: 0 };

  const cardIds = cards.map((c) => c.id);
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("card_id, event_type, occurred_at")
    .in("card_id", cardIds)
    .eq("is_bot", false)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (eventsError) {
    console.error("[smartcard-company] Error listando events:", eventsError.message);
    if (throwOnError) throw new Error("Unable to load SmartCard activity");
    return { totalCards: cards.length, totalEvents: 0, byType: {}, cards: [] };
  }

  const byCard = new Map<string, { byType: Record<string, number>; total: number; lastActivityAt: string | null }>();
  const companyByType: Record<string, number> = {};
  let companyTotal = 0;

  for (const e of events ?? []) {
    companyByType[e.event_type] = (companyByType[e.event_type] ?? 0) + 1;
    companyTotal += 1;

    const entry = byCard.get(e.card_id) ?? { byType: {}, total: 0, lastActivityAt: null };
    entry.byType[e.event_type] = (entry.byType[e.event_type] ?? 0) + 1;
    entry.total += 1;
    // events is ordered newest-first, so the first row seen per card is its
    // most recent activity.
    if (!entry.lastActivityAt) entry.lastActivityAt = e.occurred_at;
    byCard.set(e.card_id, entry);
  }

  const cardStats: CardStatsEntry[] = cards.map((c) => {
    const stats = byCard.get(c.id) ?? { byType: {}, total: 0, lastActivityAt: null };
    return {
      cardId: c.id,
      cardCode: c.card_code,
      status: c.status,
      destinationType: c.destination_type,
      destinationUrl: c.destination_url,
      profileId: c.profile_id,
      clientName: clientNameById.get(c.client_id) ?? "—",
      totalEvents: stats.total,
      byType: stats.byType,
      lastActivityAt: stats.lastActivityAt,
    };
  });
  cardStats.sort((a, b) => b.totalEvents - a.totalEvents);

  return {
    totalCards: cards.length,
    totalEvents: companyTotal,
    byType: companyByType,
    cards: cardStats,
  };
}

/**
 * cards.destination_type = PROFILE routes to this — confirmed 2026-09-29
 * against real data (a JSON dump of the live `profiles` table) after
 * discovering `admin_profiles` (an earlier, wrong guess going only off the
 * table name) isn't it; cards.profile_id really references `profiles`,
 * verified via pg_constraint, not by name-matching.
 *
 * Deliberately excludes columns that stay REYMEN/admin-only for now:
 * `slug` (changes the profile's own vanity URL — link.reymensolutions.mx/
 * {slug} — out of scope, and risky to let a client change unknowingly),
 * `status`/`is_noindex` (can take the whole profile offline or out of
 * search), and `theme_id` (catálogo de temas, sigue siendo solo de
 * admin.reymen.mx). `theme_overrides` SÍ se expone, pero acotado a
 * primary_color/accent_color únicamente (2026-10-06, "tema básico" —
 * logo ya vive en su propia columna logo_url, no en theme_overrides) —
 * layout/font/border_radius/background de ese mismo jsonb (ver
 * reymen-smartcard's packages/lib/src/theme-tokens.ts) quedan fuera de
 * este formulario y se preservan tal cual al guardar (nunca se
 * sobrescribe el objeto completo, ver updateSmartcardProfile).
 */
export interface SmartcardProfile {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  company: string | null;
  bio: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  tiktok: string | null;
  youtube: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export interface ProfileLink {
  id: string;
  title: string;
  url: string;
  icon?: string | null;
  sortOrder: number;
}

const PROFILE_SELECT =
  "id, display_name, first_name, last_name, job_title, company, bio, photo_url, logo_url, " +
  "phone, whatsapp, email, website, address, maps_url, instagram, facebook, linkedin, tiktok, youtube, theme_overrides";

/** theme_overrides es jsonb libre en forma (controlado en contenido por
 * quien escribe, ver updateSmartcardProfile) — se lee de forma defensiva,
 * cualquier llave que no sea el string esperado se trata como ausente. */
function readThemeOverrideColor(overrides: unknown, key: "primary_color" | "accent_color"): string | null {
  if (!overrides || typeof overrides !== "object") return null;
  const value = (overrides as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function mapProfileRow(p: Record<string, unknown>): SmartcardProfile {
  return {
    id: p.id as string,
    displayName: p.display_name as string,
    firstName: p.first_name as string | null,
    lastName: p.last_name as string | null,
    jobTitle: p.job_title as string | null,
    company: p.company as string | null,
    bio: p.bio as string | null,
    photoUrl: p.photo_url as string | null,
    logoUrl: p.logo_url as string | null,
    phone: p.phone as string | null,
    whatsapp: p.whatsapp as string | null,
    email: p.email as string | null,
    website: p.website as string | null,
    address: p.address as string | null,
    mapsUrl: p.maps_url as string | null,
    instagram: p.instagram as string | null,
    facebook: p.facebook as string | null,
    linkedin: p.linkedin as string | null,
    tiktok: p.tiktok as string | null,
    youtube: p.youtube as string | null,
    primaryColor: readThemeOverrideColor(p.theme_overrides, "primary_color"),
    accentColor: readThemeOverrideColor(p.theme_overrides, "accent_color"),
  };
}

/**
 * Loads a profile + its links, scoped to companyId (via the same
 * clients!inner(company_id) join pattern as the card actions) — returns
 * null on anything from "not found" to "belongs to another company", so
 * callers can't distinguish the two (same reasoning as the card actions:
 * don't leak which UUIDs exist to a company that shouldn't see them).
 */
export async function getSmartcardProfile(
  profileId: string,
  companyId: string
): Promise<{ profile: SmartcardProfile; links: ProfileLink[] } | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(`${PROFILE_SELECT}, clients!inner(company_id)`)
    .eq("id", profileId)
    .is("deleted_at", null)
    .maybeSingle<Record<string, unknown> & { clients: { company_id: string } }>();

  if (profileError) {
    console.error("[smartcard-company] Error buscando profile:", profileError.message);
    return null;
  }
  if (!profileRow || profileRow.clients.company_id !== companyId) return null;

  const { data: linkRows, error: linksError } = await supabase
    .from("profile_links")
    .select("id, title, url, icon, sort_order")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    // Los productos (type = 'product', ver smartcard-products.ts) se editan aparte.
    .or("type.is.null,type.neq.product")
    .order("sort_order", { ascending: true });

  if (linksError) {
    console.error("[smartcard-company] Error listando profile_links:", linksError.message);
  }

  return {
    profile: mapProfileRow(profileRow),
    links: (linkRows ?? []).map((l) => ({
      id: l.id as string,
      title: l.title as string,
      url: l.url as string,
      icon: (l.icon as string | null) ?? null,
      sortOrder: l.sort_order as number,
    })),
  };
}

/**
 * Merges primary_color/accent_color into a profile's theme_overrides —
 * never overwrites the jsonb object whole, only sets/clears those two
 * keys, so a layout/font/border_radius override that might already be
 * there (set some other way, outside this self-service scope) survives
 * untouched. null clears a color (deletes the key rather than writing
 * null — keeps the shape the same "absent = fall back to theme" contract
 * mergeThemeConfig expects on the read side, see reymen-smartcard's
 * packages/lib/src/theme-tokens.ts).
 *
 * Re-verifies company ownership itself (same reasoning as every other
 * function here — the Supabase client is service-role, no RLS net).
 * Caller (updateSmartcardProfile) validates hex format before calling
 * this; this function trusts its input is either a valid #RRGGBB or null.
 */
export async function updateProfileThemeColors(
  profileId: string,
  companyId: string,
  colors: { primaryColor: string | null; accentColor: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const { data: row, error: readError } = await supabase
    .from("profiles")
    .select("theme_overrides, clients!inner(company_id)")
    .eq("id", profileId)
    .is("deleted_at", null)
    .maybeSingle<{ theme_overrides: unknown; clients: { company_id: string } }>();

  if (readError) {
    console.error("[smartcard-company] Error leyendo theme_overrides:", readError.message);
    return { ok: false, error: "No se pudo guardar el tema. Intenta de nuevo." };
  }
  if (!row || row.clients.company_id !== companyId) {
    return { ok: false, error: "Ese perfil no pertenece a tu empresa." };
  }

  const current = (row.theme_overrides && typeof row.theme_overrides === "object" ? row.theme_overrides : {}) as Record<
    string,
    unknown
  >;
  const next = { ...current };
  if (colors.primaryColor) next.primary_color = colors.primaryColor;
  else delete next.primary_color;
  if (colors.accentColor) next.accent_color = colors.accentColor;
  else delete next.accent_color;

  const { error: writeError } = await supabase
    .from("profiles")
    .update({ theme_overrides: next, updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (writeError) {
    console.error("[smartcard-company] Error actualizando theme_overrides:", writeError.message);
    return { ok: false, error: "No se pudo guardar el tema. Intenta de nuevo." };
  }
  return { ok: true };
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, CreditCard, Users, Activity, Pencil, QrCode } from "lucide-react";
import { toast } from "sonner";
import { MetricGrid } from "@/components/shared/MetricGrid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { usePreferences } from "@/context/preferences";
import { TabBar } from "@/components/shared/TabBar";
import { SmartcardProfileDialog } from "@/components/portal/SmartcardProfileDialog";
import {
  inviteSmartcardTeamMember,
  updateSmartcardCardDestination,
  createSmartcardCardProfile,
  getSmartcardCardQrCode,
} from "@/actions/portal/smartcard";
import {
  EVENT_TYPE_LABELS_ES,
  type SmartcardMembership,
  type CompanyRosterEntry,
  type CompanyCardStats,
  type CardStatsEntry,
  type DestinationTypeOption,
} from "@/lib/smartcard-company";
import { translateMessage } from "@/lib/user-error";

const MODULE_LABELS_ES: Record<string, string> = {
  smartcard: "SmartCard",
  realty: "Real Estate",
  food: "Food",
  retail: "Retail",
  care: "Care",
};
const MODULE_LABELS_EN: Record<string, string> = {
  smartcard: "SmartCard",
  realty: "Real Estate",
  food: "Food",
  retail: "Retail",
  care: "Care",
};

const ROLE_LABELS_ES: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  manager: "Gerente",
  staff: "Personal",
  agent: "Asesor",
};
const ROLE_LABELS_EN: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  agent: "Agent",
};

// EVENT_TYPE_LABELS_ES itself is imported from smartcard-company.ts (single
// source of truth, next to the query that produces the raw event_type
// values) — this English pair lives here since lib/ only ever needed the
// Spanish one so far.
const EVENT_TYPE_LABELS_EN: Record<string, string> = {
  qr_scan: "QR scans",
  profile_view: "Profile views",
  whatsapp_click: "WhatsApp clicks",
  call_click: "Call clicks",
  email_click: "Email clicks",
  facebook_click: "Facebook clicks",
  instagram_click: "Instagram clicks",
  custom_link_click: "Custom link clicks",
  save_contact: "Contacts saved",
  external_redirect: "Redirects to another link",
};

const INVITABLE_ROLES = ["admin", "manager", "staff", "agent"];

function StatTile({ label, value }: { label: string; value: number }) {
  const { lang } = usePreferences();
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
      <div className="break-words text-2xl font-semibold tabular-nums text-slate-900">{value.toLocaleString(lang === "es" ? "es-MX" : "en-US")}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function EventBreakdown({ counts, labels, lang }: { counts: Record<string, number>; labels: Record<string, string>; lang: string }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(0, ...entries.map(([, count]) => count));
  if (!entries.length) return <p className="text-sm text-slate-500">{lang === "es" ? "Todavía no hay actividad." : "No activity yet."}</p>;
  return <MetricGrid as="ul" columns={2} density="comfortable">
    {entries.map(([type, count]) => <li key={type} className="min-w-0 rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0 break-words text-slate-600">{labels[type] ?? type.replaceAll("_", " ")}</span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-900">{count.toLocaleString(lang === "es" ? "es-MX" : "en-US")}</span>
      </div>
      <div aria-hidden="true" className="h-1.5 rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${max ? Math.max(0, Math.min(100, count / max * 100)) : 0}%` }} />
      </div>
    </li>)}
  </MetricGrid>;
}

/**
 * Client half of the SmartCard page — dashboard summary (contracted
 * modules) + team roster/invite, both ported from reymen-smartcard's
 * apps/ops app/dashboard + app/settings pages (see page.tsx and
 * actions/portal/smartcard.ts for the fuller history). UI-wise this
 * follows THIS app's own conventions (toast + useTransition, matching
 * OrganizationModulesPanel.tsx) rather than the original's full-page
 * redirect-with-query-string-error pattern.
 *
 * The "Equipo" card intentionally does NOT list members one by one anymore
 * (see the removed per-row markup in git history). Two reasons, not one:
 *   1. Privacy, ported on purpose from the original product — company_users
 *      never exposed other members' emails, RLS scoped `user_profiles` to
 *      your own row only. getCompanyRoster() still only returns role/status,
 *      no name/email, so a real per-row list here could only ever show a
 *      placeholder like "Integrante" for everyone but yourself — theater,
 *      not information.
 *   2. This portal already has a real, working team list with actual names
 *      (Configuración → Equipo, backed by this app's own User table) —
 *      inviteSmartcardTeamMember() below already provisions an account
 *      there for every SmartCard invite. Duplicating a (worse) roster view
 *      here just to have one on this page isn't worth it; the seat count
 *      in the header plus a link to Settings covers what this page needs
 *      to say about who's on the team, without the SmartCard invite path's
 *      own company_users provisioning (the part unique to this page) going
 *      away.
 */
export function SmartcardPanel({
  membership,
  roster,
  cardStats,
  destinationTypes,
  timeZone = "America/Mexico_City",
}: {
  membership: SmartcardMembership;
  roster: CompanyRosterEntry[];
  cardStats: CompanyCardStats;
  destinationTypes: DestinationTypeOption[];
  timeZone?: string;
}) {
  const { lang } = usePreferences();
  const MODULE_LABELS = lang === "es" ? MODULE_LABELS_ES : MODULE_LABELS_EN;
  const ROLE_LABELS = lang === "es" ? ROLE_LABELS_ES : ROLE_LABELS_EN;
  const EVENT_TYPE_LABELS = lang === "es" ? EVENT_TYPE_LABELS_ES : EVENT_TYPE_LABELS_EN;

  const avgEventsPerCard = cardStats.totalCards > 0 ? Math.round(cardStats.totalEvents / cardStats.totalCards) : 0;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState("staff");
  const [isPending, startTransition] = useTransition();

  const canManageTeam = ["owner", "admin"].includes(membership.roleCode);
  // Wider than team invites on purpose (2026-09-29): a manager shouldn't
  // have to wait on the owner or Reymen for something this routine — cards
  // represent spots like "Recepción" or "Mesa 1", not individual logins,
  // so there's no per-person ownership to restrict this to either.
  const canEditCards = ["owner", "admin", "manager"].includes(membership.roleCode);
  const [editingCard, setEditingCard] = useState<CardStatsEntry | null>(null);
  const [editType, setEditType] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [isPendingCardEdit, startCardEditTransition] = useTransition();

  // Per-card event-type breakdown (2026-10-07, user request) — the data was
  // already computed server-side (CardStatsEntry.byType, see
  // getCompanyCardStats) but never surfaced here; the company-wide "Por tipo
  // de evento" section above was the only breakdown shown. This just adds an
  // expand/collapse toggle per row reusing that same data, no new query.
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Pestañas: Resumen, Tarjetas y Equipo (antes todo iba en una sola página larga).
  const [tab, setTab] = useState<"resumen" | "tarjetas" | "equipo">("resumen");
  const tabs = [
    { key: "resumen", label: lang === "es" ? "Resumen" : "Overview" },
    { key: "tarjetas", label: lang === "es" ? "Tarjetas" : "Cards", count: cardStats.totalCards },
    { key: "equipo", label: lang === "es" ? "Equipo" : "Team" },
  ];

  function openEditCard(c: CardStatsEntry) {
    setEditingCard(c);
    setEditType(c.destinationType);
    setEditUrl(c.destinationUrl ?? "");
  }

  const editSelectedTypeInfo = destinationTypes.find((d) => d.code === editType);

  function handleSaveCard() {
    if (!editingCard) return;
    startCardEditTransition(async () => {
      // Switching a card TO "Perfil digital" is a different action than
      // every other destination (it creates a profiles row, not just a
      // column update) — see createSmartcardCardProfile's own comment.
      // editingCard is never already a profile card here: the row's own
      // "Editar perfil" button opens SmartcardProfileDialog instead of this
      // dialog for those, so this branch only ever runs on a fresh switch.
      if (editType === "PROFILE") {
        const result = await createSmartcardCardProfile(editingCard.cardId);
        if (!result.success) {
          toast.error(translateMessage(result.error));
          return;
        }
        toast.success(
          lang === "es"
            ? "Perfil digital creado. Complétalo con la info del negocio."
            : "Digital profile created. Fill it in with the business info."
        );
        setEditingCard(null);
        setEditingProfileId(result.profileId);
        return;
      }

      const result = await updateSmartcardCardDestination(editingCard.cardId, editType, editUrl);
      if (!result.success) {
        toast.error(translateMessage(result.error));
        return;
      }
      toast.success(lang === "es" ? "Tarjeta actualizada." : "Card updated.");
      setEditingCard(null);
    });
  }

  // A card whose destination is the rich PROFILE type gets a separate
  // "Editar perfil" flow (SmartcardProfileDialog) instead of the
  // destination-type+URL dialog above — that dialog still exists and still
  // works for simple redirect-only cards (WHATSAPP, MAPS, etc.), it just
  // can't be used to switch a card INTO or edit the content of a profile
  // (see updateSmartcardCardDestination's own guard on requiresProfile).
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const [downloadingQrCardId, setDownloadingQrCardId] = useState<string | null>(null);

  async function handleDownloadQr(c: CardStatsEntry) {
    setDownloadingQrCardId(c.cardId);
    try {
      const result = await getSmartcardCardQrCode(c.cardId);
      if (!result.success) {
        toast.error(translateMessage(result.error));
        return;
      }
      // Trigger a browser download of the generated PNG data URL — no
      // extra round trip needed, the data: URL itself is the file.
      const link = document.createElement("a");
      link.href = result.dataUrl;
      link.download = `${c.cardCode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error(lang === "es" ? "No se pudo generar el QR" : "Couldn't generate the QR");
    } finally {
      setDownloadingQrCardId(null);
    }
  }
  const seatCount = roster.filter((m) => m.status === "invited" || m.status === "active").length;
  const maxTeamMembers = membership.limits.smartcard?.max_team_members as number | undefined;
  const atLimit = typeof maxTeamMembers === "number" && seatCount >= maxTeamMembers;

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // inviteSmartcardTeamMember returns { success } / { success: false, error }
      // instead of throwing — Next.js redacts a thrown Server Action error's
      // message in production, so relying on try/catch here showed a generic
      // crash instead of the real reason (see the action's own comment).
      try {
        const result = await inviteSmartcardTeamMember(name, email, roleCode, password);
        if (!result.success) {
          toast.error(translateMessage(result.error));
          return;
        }
        toast.success(
          lang === "es"
            ? "Listo. Comparte la contraseña temporal con esa persona para que inicie sesión."
            : "Done. Share the temporary password with that person so they can log in."
        );
        setName("");
        setEmail("");
        setPassword("");
        setRoleCode("staff");
      } catch {
        // Belt-and-suspenders only — inviteSmartcardTeamMember shouldn't throw.
        toast.error(lang === "es" ? "Error al invitar" : "Error inviting");
      }
    });
  }

  return (
    <section aria-label="SmartCard" className="mx-auto w-full min-w-0 max-w-6xl space-y-4 [overflow-wrap:anywhere]">
      <div>
        <h1 className="break-words text-2xl font-semibold tabular-nums text-slate-900">SmartCard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {lang === "es" ? "Empresa" : "Company"}: {membership.companyName} ·{" "}
          {lang === "es" ? "tu rol" : "your role"}: {ROLE_LABELS[membership.roleCode] ?? membership.roleCode}
        </p>
      </div>

      <TabBar tabs={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} label={lang === "es" ? "Secciones de SmartCard" : "SmartCard sections"} idBase="sc" />

      {tab === "resumen" && (
        <div role="tabpanel" id="sc-panel-resumen" aria-labelledby="sc-tab-resumen" className="space-y-4">
      <Card>
        <CardHeader className="p-3 sm:p-4 flex-row items-center gap-2">
          <CreditCard className="h-4 w-4 text-slate-400" />
          <CardTitle>{lang === "es" ? "Módulos contratados" : "Contracted modules"}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
          {membership.modules.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              {lang === "es"
                ? "Esta empresa todavía no tiene ningún módulo habilitado. Contacta a Reymen para activar un plan."
                : "This company doesn't have any module enabled yet. Contact Reymen to activate a plan."}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {membership.modules.map((m) => (
                <li key={m} className="rounded-full bg-slate-50 px-3 py-1 text-slate-700">
                  {MODULE_LABELS[m] ?? m}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="p-3 sm:p-4 flex-row items-center gap-2">
          <Activity className="h-4 w-4 text-slate-400" />
          <CardTitle>{lang === "es" ? "Estadísticas de tarjetas" : "Card statistics"}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
          {cardStats.totalCards === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              {lang === "es"
                ? "Todavía no hay tarjetas emitidas para esta empresa."
                : "No cards have been issued for this company yet."}
            </p>
          ) : (
            <div className="space-y-6">
              <MetricGrid>
                <StatTile label={lang === "es" ? "Tarjetas" : "Cards"} value={cardStats.totalCards} />
                <StatTile label={lang === "es" ? "Eventos totales" : "Total events"} value={cardStats.totalEvents} />
                <StatTile
                  label={lang === "es" ? "Promedio por tarjeta" : "Average per card"}
                  value={avgEventsPerCard}
                />
              </MetricGrid>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">{lang === "es" ? "Actividad por tipo de evento" : "Activity by event type"}</h3>
                <EventBreakdown counts={cardStats.byType} labels={EVENT_TYPE_LABELS} lang={lang} />
              </div>

            </div>
          )}
        </CardContent>
      </Card>

        </div>
      )}

      {tab === "tarjetas" && (
        <div role="tabpanel" id="sc-panel-tarjetas" aria-labelledby="sc-tab-tarjetas" className="space-y-4">
      <Card>
        <CardHeader className="p-3 sm:p-4 flex-row items-center gap-2">
          <CreditCard className="h-4 w-4 text-slate-400" />
          <CardTitle>{lang === "es" ? "Tarjetas" : "Cards"}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
          {cardStats.totalCards === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              {lang === "es" ? "Todavía no hay tarjetas emitidas para esta empresa." : "No cards have been issued for this company yet."}
            </p>
          ) : (
              <div>
                <MetricGrid columns={2} density="comfortable">
                  {cardStats.cards.map((c) => {
                    const isExpanded = expandedCardId === c.cardId;
                    const isProfileCard = c.destinationType === "PROFILE" && !!c.profileId;
                    const statusLabels: Record<string, string> = lang === "es"
                      ? { active: "Activa", inactive: "Inactiva", suspended: "Suspendida", disabled: "Deshabilitada", pending: "Pendiente", blocked: "Bloqueada" }
                      : { active: "Active", inactive: "Inactive", suspended: "Suspended", disabled: "Disabled", pending: "Pending", blocked: "Blocked" };
                    return <article key={c.cardId} className="rounded-xl border border-slate-200 p-3 sm:p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-slate-900">{c.clientName}</h4>
                          <p className="mt-1 break-all font-mono text-xs text-slate-500">{c.cardCode}</p>
                        </div>
                        <Badge variant="secondary">{statusLabels[c.status.toLowerCase()] ?? c.status}</Badge>
                      </div>
                      <dl className="my-3 space-y-1 text-sm">
                        <div className="flex flex-wrap justify-between gap-x-3"><dt className="text-slate-500">{lang === "es" ? "Eventos" : "Events"}</dt><dd className="font-semibold tabular-nums">{c.totalEvents.toLocaleString(lang === "es" ? "es-MX" : "en-US")}</dd></div>
                        <div className="flex flex-wrap justify-between gap-x-3"><dt className="text-slate-500">{lang === "es" ? "Última actividad" : "Last activity"}</dt><dd>{c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { year: "numeric", month: "short", day: "numeric", timeZone }) : lang === "es" ? "Sin actividad" : "No activity"}</dd></div>
                      </dl>
                      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                        <Button variant="outline" size="sm" className="min-h-11" aria-expanded={isExpanded} aria-controls={`card-events-${c.cardId}`} onClick={() => setExpandedCardId(isExpanded ? null : c.cardId)}>
                          {isExpanded ? lang === "es" ? "Ocultar actividad" : "Hide activity" : lang === "es" ? "Ver actividad" : "View activity"}
                        </Button>
                        {canEditCards && <>
                          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => isProfileCard ? setEditingProfileId(c.profileId) : openEditCard(c)}>
                            <Pencil className="h-4 w-4 shrink-0" />{isProfileCard ? lang === "es" ? "Editar perfil" : "Edit profile" : lang === "es" ? "Editar" : "Edit"}
                          </Button>
                          <Button variant="ghost" size="sm" className="min-h-11" disabled={downloadingQrCardId === c.cardId} onClick={() => handleDownloadQr(c)} aria-label={lang === "es" ? `Descargar QR de ${c.cardCode}` : `Download QR for ${c.cardCode}`}>
                            {downloadingQrCardId === c.cardId ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <QrCode className="h-4 w-4" />}QR
                          </Button>
                        </>}
                      </div>
                      {isExpanded && <div id={`card-events-${c.cardId}`} className="mt-3 border-t border-slate-100 pt-3"><EventBreakdown counts={c.byType} labels={EVENT_TYPE_LABELS} lang={lang} /></div>}
                    </article>;
                  })}
                </MetricGrid>
              </div>
          )}
        </CardContent>
      </Card>
        </div>
      )}

      {tab === "equipo" && (
        <div role="tabpanel" id="sc-panel-equipo" aria-labelledby="sc-tab-equipo" className="space-y-4">
      <Card>
        <CardHeader className="p-3 sm:p-4 flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <CardTitle>{lang === "es" ? "Equipo" : "Team"}</CardTitle>
          </div>
          <span className={`text-sm ${atLimit ? "font-medium text-amber-700" : "text-slate-500"}`}>
            {seatCount} / {maxTeamMembers ?? "∞"} {lang === "es" ? "integrantes" : "members"}
          </span>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
          <p className="mb-4 text-sm text-slate-500">
            {lang === "es"
              ? "Por privacidad no se listan nombres aquí. "
              : "Names aren't listed here for privacy. "}
            <Link href="/portal/settings" className="font-medium text-brand-600 hover:underline">
              {lang === "es" ? "Ve a Configuración" : "Go to Settings"}
            </Link>
            {lang === "es"
              ? " para ver quién es cada integrante, cambiar su rol o darlo de baja del portal."
              : " to see who each member is, change their role, or remove them from the portal."}
          </p>

          {canManageTeam ? (
            atLimit ? (
              <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
                {lang === "es"
                  ? "Llegaste al límite de integrantes de tu plan. Contacta a Reymen para subir de plan."
                  : "You reached your plan's member limit. Contact Reymen to upgrade."}
              </p>
            ) : (
              <form onSubmit={handleInvite} className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">
                  {lang === "es"
                    ? "Se crea una cuenta del portal para esa persona con la contraseña que pongas aquí — compártesela tú directamente después."
                    : "This creates a portal account for that person with the password you set here — share it with them directly afterward."}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-name" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Nombre completo" : "Full name"}
                    </label>
                    <input
                      id="smartcard-invite-name"
                      type="text"
                      required
                      minLength={2}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder={lang === "es" ? "Ana Martínez" : "Jane Doe"}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-email" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Correo" : "Email"}
                    </label>
                    <input
                      id="smartcard-invite-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder="nombre@empresa.com"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-role" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Rol" : "Role"}
                    </label>
                    <select
                      id="smartcard-invite-role"
                      value={roleCode}
                      onChange={(e) => setRoleCode(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {INVITABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="smartcard-invite-password" className="text-xs font-medium text-slate-600">
                      {lang === "es" ? "Contraseña temporal" : "Temporary password"}
                    </label>
                    <input
                      id="smartcard-invite-password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder={lang === "es" ? "Mínimo 8 caracteres" : "At least 8 characters"}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isPending} className="self-end">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {lang === "es" ? "Invitar" : "Invite"}
                </Button>
              </form>
            )
          ) : (
            <p className="text-sm text-slate-400">
              {lang === "es"
                ? "Solo el dueño o un administrador puede invitar integrantes."
                : "Only the owner or an admin can invite members."}
            </p>
          )}
        </CardContent>
      </Card>
        </div>
      )}


      <Dialog open={editingCard !== null} onOpenChange={(open) => !open && setEditingCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lang === "es" ? "Editar tarjeta" : "Edit card"} {editingCard ? `· ${editingCard.cardCode}` : ""}
            </DialogTitle>
            <DialogDescription>
              {editingCard?.clientName}
              {" — "}
              {lang === "es"
                ? "Cambia a dónde manda esta tarjeta cuando alguien la escanea."
                : "Change where this card sends people when scanned."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-card-destination-type">{lang === "es" ? "Destino" : "Destination"}</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger id="edit-card-destination-type">
                  <SelectValue placeholder={lang === "es" ? "Selecciona un destino" : "Select a destination"} />
                </SelectTrigger>
                <SelectContent>
                  {destinationTypes.map((d) => {
                    // "Perfil digital" (PROFILE) is the one requires_profile
                    // type this dialog actually supports (it creates the
                    // profile on save, see handleSaveCard) — any OTHER
                    // hypothetical requires_profile type stays disabled,
                    // same as before.
                    const disabled = d.requiresProfile && d.code !== "PROFILE";
                    return (
                      <SelectItem key={d.code} value={d.code} disabled={disabled}>
                        {d.label}
                        {disabled ? (lang === "es" ? " (próximamente)" : " (coming soon)") : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {editSelectedTypeInfo?.requiresUrl && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-card-destination-url">URL</Label>
                <Input
                  id="edit-card-destination-url"
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}

            {editSelectedTypeInfo?.code === "PROFILE" && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {lang === "es"
                  ? "Se crea un perfil digital nuevo para este cliente. Después de guardar se abre el editor para completarlo (foto, bio, redes, enlaces)."
                  : "This creates a new digital profile for this client. After saving, the editor opens so you can fill it in (photo, bio, socials, links)."}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCard(null)} disabled={isPendingCardEdit}>
              {lang === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveCard} disabled={isPendingCardEdit || !editType}>
              {isPendingCardEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              {editType === "PROFILE"
                ? lang === "es"
                  ? "Activar perfil digital"
                  : "Activate digital profile"
                : lang === "es"
                  ? "Guardar"
                  : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SmartcardProfileDialog
        profileId={editingProfileId}
        onOpenChange={(open) => !open && setEditingProfileId(null)}
        lang={lang}
      />
    </section>
  );
}

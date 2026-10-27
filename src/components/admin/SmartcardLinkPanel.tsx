"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CreditCard, Loader2, Unlink, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addSmartcardMemberAction,
  createSmartcardCompanyAction,
  linkSmartcardCompanyAction,
  removeSmartcardMemberAction,
  syncSmartcardMemberLimitAction,
  unlinkSmartcardCompanyAction,
} from "@/actions/admin/smartcard-link";
import { SMARTCARD_LINK_ROLES, type SmartcardLinkRole, type SmartcardLinkState } from "@/lib/smartcard-link-shared";
import { TabBar } from "@/components/shared/TabBar";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

const COPY = {
  es: {
    title: "SmartCard",
    notConfigured: "SmartCard no está configurado en este servidor (faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY).",
    error: "No se pudo consultar SmartCard. Recarga la página en unos minutos.",
    unlinkedIntro:
      "Este cliente todavía no tiene empresa en SmartCard, por eso su pantalla SmartCard muestra un aviso.",
    createTitle: "Crear su empresa en SmartCard",
    createHint:
      "Se crea con el nombre y el slug del cliente, ya vinculada, con el módulo SmartCard y el límite de usuarios de su plan. Sus usuarios activos reciben acceso (dueños y administradores primero).",
    createButton: (name: string) => `Crear empresa «${name}»`,
    created: (granted: number, skipped: number) =>
      `Empresa creada. Acceso dado a ${granted} usuario${granted === 1 ? "" : "s"}${skipped ? `; ${skipped} sin acceso por el límite del plan o por error (agrégalos en Accesos)` : ""}.`,
    orLink: "¿Ya tiene una empresa en SmartCard? Vincúlala:",
    noCandidates: "No hay empresas libres en SmartCard para vincular.",
    stale: "vínculo roto",
    staleHint:
      "“Vínculo roto”: la empresa apunta a un cliente que no existe en Reymen (borrado o de otro entorno). Al vincularla aquí se corrige.",
    taken: "Ya vinculadas a otros clientes:",
    company: "Empresa en SmartCard",
    choose: "Elige una empresa",
    link: "Vincular",
    linkedTo: "Vinculado con",
    unlink: "Desvincular",
    unlinkConfirm: "¿Desvincular? El cliente dejará de ver SmartCard en Reymen. Sus tarjetas y datos se quedan en SmartCard.",
    members: "Quién ve SmartCard",
    tabsLabel: "Secciones de SmartCard",
    tabCompany: "Empresa",
    tabAccess: "Accesos",
    membersHint: "Solo lo ven los usuarios de este cliente que estén aquí como activos.",
    noMembers: "Nadie todavía.",
    notInReymen: "no es usuario de este cliente",
    user: "Usuario",
    chooseUser: "Elige un usuario",
    role: "Rol",
    give: "Dar acceso",
    remove: "Quitar acceso",
    removeConfirm: (email: string) => `¿Quitar el acceso a SmartCard de ${email}?`,
    linked: "Empresa vinculada",
    unlinked: "Empresa desvinculada",
    added: "Acceso dado",
    updated: "Acceso actualizado",
    removed: "Acceso quitado",
    failed: "No se pudo completar",
    allIn: "Todos los usuarios activos de este cliente ya tienen acceso.",
    limit: (current: string, plan: string) => `Límite de integrantes en SmartCard: ${current} · según su plan: ${plan}`,
    noModule: "Esta empresa no tiene el módulo SmartCard en SmartCard, así que no tiene límite de integrantes que ajustar.",
    unlimited: "sin límite",
    applyLimit: "Aplicar límite del plan",
    limitDone: "Límite actualizado en SmartCard",
    roles: { owner: "Dueño", admin: "Administrador", manager: "Gerente", staff: "Personal", agent: "Agente" },
    status: { active: "Activo", invited: "Invitado" } as Record<string, string>,
  },
  en: {
    title: "SmartCard",
    notConfigured: "SmartCard isn't configured on this server (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing).",
    error: "Couldn't reach SmartCard. Reload the page in a few minutes.",
    unlinkedIntro: "This client doesn't have a SmartCard company yet, so their SmartCard screen shows a notice.",
    createTitle: "Create their SmartCard company",
    createHint:
      "It's created with the client's name and slug, already linked, with the SmartCard module and their plan's user limit. Their active users get access (owners and admins first).",
    createButton: (name: string) => `Create “${name}” company`,
    created: (granted: number, skipped: number) =>
      `Company created. Access given to ${granted} user${granted === 1 ? "" : "s"}${skipped ? `; ${skipped} left out by the plan limit or an error (add them in Access)` : ""}.`,
    orLink: "Already has a SmartCard company? Link it:",
    noCandidates: "There are no free SmartCard companies to link.",
    stale: "broken link",
    staleHint:
      "“Broken link”: the company points to a client that doesn't exist in Reymen (deleted or from another environment). Linking it here fixes it.",
    taken: "Already linked to other clients:",
    company: "SmartCard company",
    choose: "Choose a company",
    link: "Link",
    linkedTo: "Linked to",
    unlink: "Unlink",
    unlinkConfirm: "Unlink? The client will stop seeing SmartCard in Reymen. Their cards and data stay in SmartCard.",
    members: "Who sees SmartCard",
    tabsLabel: "SmartCard sections",
    tabCompany: "Company",
    tabAccess: "Access",
    membersHint: "Only this client's users listed here as active can see it.",
    noMembers: "Nobody yet.",
    notInReymen: "isn't a user of this client",
    user: "User",
    chooseUser: "Choose a user",
    role: "Role",
    give: "Give access",
    remove: "Remove access",
    removeConfirm: (email: string) => `Remove SmartCard access for ${email}?`,
    linked: "Company linked",
    unlinked: "Company unlinked",
    added: "Access given",
    updated: "Access updated",
    removed: "Access removed",
    failed: "Couldn't complete",
    allIn: "Every active user of this client already has access.",
    limit: (current: string, plan: string) => `SmartCard member limit: ${current} · per their plan: ${plan}`,
    noModule: "This company doesn't have the SmartCard module in SmartCard, so there's no member limit to adjust.",
    unlimited: "unlimited",
    applyLimit: "Apply plan limit",
    limitDone: "Limit updated in SmartCard",
    roles: { owner: "Owner", admin: "Admin", manager: "Manager", staff: "Staff", agent: "Agent" },
    status: { active: "Active", invited: "Invited" } as Record<string, string>,
  },
};

export interface SmartcardLinkUser {
  id: string;
  name: string | null;
  email: string;
}

export function SmartcardLinkPanel({
  orgId,
  orgName,
  state,
  users,
  planLimit,
}: {
  orgId: string;
  orgName: string;
  state: SmartcardLinkState;
  users: SmartcardLinkUser[];
  /** Límite de usuarios del plan de Reymen (null = sin límite). */
  planLimit: number | null;
}) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [pending, startTransition] = useTransition();
  const [companyId, setCompanyId] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<SmartcardLinkRole>("owner");
  const [sub, setSub] = useState<"empresa" | "accesos">("empresa");

  function run(action: () => Promise<unknown>, done: (result: unknown) => string) {
    startTransition(async () => {
      try {
        toast.success(done(await action()));
      } catch (e) {
        toast.error(getErrorMessage(e, t.failed));
      }
    });
  }

  const userEmails = new Set(users.map((u) => u.email.toLowerCase()));

  let body: React.ReactNode;
  if (state.status === "not_configured") {
    body = <p className="text-sm text-slate-500">{t.notConfigured}</p>;
  } else if (state.status === "error") {
    body = <p className="text-sm text-red-600">{t.error}</p>;
  } else if (state.status === "unlinked") {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{t.unlinkedIntro}</p>
        <div className="space-y-2 rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">{t.createTitle}</p>
          <p className="text-xs text-slate-500">{t.createHint}</p>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => createSmartcardCompanyAction({ orgId }),
                (r) => {
                  const { granted, skipped } = r as { granted: number; skipped: number };
                  return t.created(granted, skipped);
                }
              )
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.createButton(orgName)}
          </Button>
        </div>
        <p className="text-sm text-slate-500">{t.orLink}</p>
        {state.candidates.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noCandidates}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <Label htmlFor="smartcardlinkpanel-f1">{t.company}</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="smartcardlinkpanel-f1" aria-label={t.company}>
                  <SelectValue placeholder={t.choose} />
                </SelectTrigger>
                <SelectContent>
                  {state.candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.slug}){c.staleOrgId ? ` · ${t.stale}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={pending || !companyId}
              onClick={() => run(() => linkSmartcardCompanyAction({ orgId, companyId }), () => t.linked)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.link}
            </Button>
          </div>
        )}
        {state.candidates.some((c) => c.staleOrgId) && <p className="text-xs text-slate-500">{t.staleHint}</p>}
        {state.taken.length > 0 && (
          <div className="text-xs text-slate-500">
            <p>{t.taken}</p>
            <ul className="mt-1 space-y-0.5">
              {state.taken.map((c) => (
                <li key={c.id}>
                  {c.name} ({c.slug}) →{" "}
                  <Link href={`/admin/clients/${c.clientId}`} className="text-brand-600 hover:underline">
                    {c.clientName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else {
    const memberEmails = new Set(state.members.map((m) => m.email).filter(Boolean));
    const available = users.filter((u) => !memberEmails.has(u.email.toLowerCase()));
    body = (
      <div className="space-y-4">
        <TabBar
          tabs={[
            { key: "empresa", label: t.tabCompany },
            { key: "accesos", label: t.tabAccess, count: state.members.length },
          ]}
          value={sub}
          onChange={(k) => setSub(k as "empresa" | "accesos")}
          label={t.tabsLabel}
          idBase="scl"
        />
        {sub === "empresa" && (
        <div role="tabpanel" id="scl-panel-empresa" aria-labelledby="scl-tab-empresa" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            {t.linkedTo} <span className="font-medium text-slate-900">{state.company.name}</span>{" "}
            <span className="text-slate-400">({state.company.slug})</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t.unlinkConfirm)) return;
              run(() => unlinkSmartcardCompanyAction({ orgId }), () => t.unlinked);
            }}
          >
            <Unlink className="h-3.5 w-3.5" />
            {t.unlink}
          </Button>
        </div>

        {state.memberLimit === undefined ? (
          <p className="text-xs text-slate-500">{t.noModule}</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-600">
              {t.limit(state.memberLimit === null ? t.unlimited : String(state.memberLimit), planLimit === null ? t.unlimited : String(planLimit))}
            </p>
            {state.memberLimit !== planLimit && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => syncSmartcardMemberLimitAction({ orgId }), () => t.limitDone)}
              >
                {t.applyLimit}
              </Button>
            )}
          </div>
        )}

        </div>
        )}

        {sub === "accesos" && (
        <div role="tabpanel" id="scl-panel-accesos" aria-labelledby="scl-tab-accesos" className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">{t.members}</p>
          <p className="text-xs text-slate-500">{t.membersHint}</p>
          {state.members.length === 0 ? (
            <p className="text-sm text-slate-400">{t.noMembers}</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {state.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-900">{m.email ?? "—"}</p>
                    {m.email && !userEmails.has(m.email) && <p className="text-xs text-amber-700">{t.notInReymen}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t.roles[m.roleCode as SmartcardLinkRole] ?? m.roleCode}</Badge>
                    <Badge variant={m.status === "active" ? "default" : "outline"}>{t.status[m.status] ?? m.status}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t.remove}
                      title={t.remove}
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t.removeConfirm(m.email ?? "—"))) return;
                        run(() => removeSmartcardMemberAction({ orgId, memberId: m.id, email: m.email }), () => t.removed);
                      }}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {available.length === 0 ? (
          <p className="text-xs text-slate-500">{t.allIn}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <Label htmlFor="smartcardlinkpanel-f2">{t.user}</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="smartcardlinkpanel-f2" aria-label={t.user}>
                  <SelectValue placeholder={t.chooseUser} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ? `${u.name} · ${u.email}` : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40 space-y-1">
              <Label>{t.role}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as SmartcardLinkRole)}>
                <SelectTrigger aria-label={t.role}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SMARTCARD_LINK_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t.roles[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={pending || !userId}
              onClick={() =>
                run(
                  async () => {
                    const outcome = await addSmartcardMemberAction({ orgId, userId, role });
                    setUserId("");
                    return outcome;
                  },
                  (outcome) => (outcome === "updated" ? t.updated : t.added)
                )
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.give}
            </Button>
          </div>
        )}
        </div>
        )}
      </div>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.title}</CardTitle>
        <CreditCard className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

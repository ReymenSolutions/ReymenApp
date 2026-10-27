"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, ChevronDown, Mail, MessageCircle, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateLeadStatus, deleteLead } from "@/actions/leads";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { LeadStatus } from "@prisma/client";

const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

const COPY = {
  es: {
    statusLabel: "Etapa del contacto",
    statusHint: "En qué punto va esta persona",
    call: "Llamar",
    whatsapp: "WhatsApp",
    email: "Correo",
    noContact: "No contactar: no recibirá mensajes ni seguimientos automáticos.",
    noPhone: "Sin teléfono",
    noEmail: "Sin correo",
    from: "Llegó por",
    since: "Desde",
    delete: "Eliminar contacto",
    confirmDelete: "¿Eliminar este contacto? Dejará de aparecer en el CRM.",
    deleted: "Contacto eliminado",
  },
  en: {
    statusLabel: "Contact stage",
    statusHint: "Where this person is in your process",
    call: "Call",
    whatsapp: "WhatsApp",
    email: "Email",
    noContact: "Do not contact: they won't receive automatic messages or follow-ups.",
    noPhone: "No phone",
    noEmail: "No email",
    from: "Came from",
    since: "Since",
    delete: "Delete contact",
    confirmDelete: "Delete this contact? It will no longer appear in the CRM.",
    deleted: "Contact deleted",
  },
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/** Número para wa.me: solo dígitos; un celular de 10 dígitos se asume mexicano. */
export function whatsappDigits(phone: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  return d.length === 10 ? `52${d}` : d;
}

interface Props {
  lead: { id: string; name: string; status: LeadStatus; email: string | null; phone: string | null; doNotContact: boolean; source: string | null; since: string };
  canUpdateStatus: boolean;
  canDelete: boolean;
}

/** Encabezado de la ficha: quién es, en qué etapa va y cómo contactarlo con un clic. */
export function LeadHeaderCard({ lead, canUpdateStatus, canDelete }: Props) {
  const { t, lang } = usePreferences();
  const c = COPY[lang === "en" ? "en" : "es"];
  const router = useRouter();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [busy, setBusy] = useState(false);
  const labels: Record<LeadStatus, string> = { NEW: t.statusNew, CONTACTED: t.statusContacted, QUALIFIED: t.statusQualified, PROPOSAL: t.statusProposal, WON: t.statusWon, LOST: t.statusLost };
  const wa = whatsappDigits(lead.phone);

  async function changeStatus(next: LeadStatus) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setBusy(true);
    try {
      await updateLeadStatus(lead.id, next);
      toast.success(t.statusUpdated);
      router.refresh();
    } catch (e) {
      setStatus(prev);
      toast.error(getErrorMessage(e, t.error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(c.confirmDelete)) return;
    setBusy(true);
    try {
      await deleteLead(lead.id);
      toast.success(c.deleted);
      router.push("/portal/leads");
    } catch (e) {
      toast.error(getErrorMessage(e, t.error));
      setBusy(false);
    }
  }

  const action = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
  const on = "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  const off = "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300";

  return (
    <section aria-label={lead.name} className="rounded-card border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div aria-hidden="true" className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700">{initials(lead.name) || "?"}</div>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-semibold text-slate-900">{lead.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {c.from} <span className="font-medium text-slate-700">{lead.source ?? "manual"}</span> · {c.since} {lead.since}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1 lg:items-end">
          <label htmlFor="lead-status" className="text-xs font-medium text-slate-500">{c.statusLabel} <span className="font-normal text-slate-400">· {c.statusHint}</span></label>
          {canUpdateStatus ? (
            <div className="relative w-full sm:w-56">
              <select id="lead-status" value={status} onChange={(e) => changeStatus(e.target.value as LeadStatus)} disabled={busy} className="w-full cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-900 focus:border-brand-400 focus:outline-none disabled:opacity-60">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{labels[s]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            </div>
          ) : (
            <StatusBadge status={status} />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {lead.phone ? (
          <a href={`tel:${lead.phone}`} className={`${action} ${on}`}><Phone className="h-4 w-4" aria-hidden="true" />{c.call}<span className="font-normal text-slate-500">{lead.phone}</span></a>
        ) : (
          <span className={`${action} ${off}`}><Phone className="h-4 w-4" aria-hidden="true" />{c.noPhone}</span>
        )}
        {wa ? (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={`${action} ${on}`}><MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />{c.whatsapp}</a>
        ) : null}
        {lead.email ? (
          <a href={`mailto:${lead.email}`} className={`${action} ${on}`}><Mail className="h-4 w-4" aria-hidden="true" />{c.email}<span className="max-w-[14rem] truncate font-normal text-slate-500">{lead.email}</span></a>
        ) : (
          <span className={`${action} ${off}`}><Mail className="h-4 w-4" aria-hidden="true" />{c.noEmail}</span>
        )}
        {canDelete && (
          <button type="button" onClick={remove} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {c.delete}
          </button>
        )}
      </div>

      {lead.doNotContact && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          <BellOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {c.noContact}
        </p>
      )}
    </section>
  );
}

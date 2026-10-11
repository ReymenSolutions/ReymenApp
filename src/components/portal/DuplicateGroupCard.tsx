"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mergeLeads } from "@/actions/leads";
import { getErrorMessage } from "@/lib/user-error";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface GroupLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  createdAt: string;
}

const COPY = {
  es: {
    samePhone: "Mismo teléfono",
    sameEmail: "Mismo correo",
    keep: "Se conserva",
    merge: "Fusionar en el más antiguo",
    confirmTitle: "¿Fusionar estos contactos?",
    confirmDesc: (keep: string, n: number) =>
      `Las notas, oportunidades, citas, conversaciones y seguimientos de ${n === 1 ? "el otro contacto" : `los otros ${n} contactos`} pasan a ${keep}, y ${n === 1 ? "ese contacto se elimina" : "esos contactos se eliminan"}. Esto no se puede deshacer.`,
    cancel: "Cancelar",
    confirm: "Fusionar",
    done: "Contactos fusionados",
    error: "Error al fusionar",
    open: "Abrir",
  },
  en: {
    samePhone: "Same phone",
    sameEmail: "Same email",
    keep: "Kept",
    merge: "Merge into the oldest",
    confirmTitle: "Merge these contacts?",
    confirmDesc: (keep: string, n: number) =>
      `Notes, opportunities, appointments, conversations and follow-ups from ${n === 1 ? "the other contact" : `the other ${n} contacts`} move to ${keep}, and ${n === 1 ? "that contact is deleted" : "those contacts are deleted"}. This can't be undone.`,
    cancel: "Cancel",
    confirm: "Merge",
    done: "Contacts merged",
    error: "Error merging",
    open: "Open",
  },
};

/** Un grupo de contactos que parecen la misma persona, con fusión en un paso. */
export function DuplicateGroupCard({ reason, value, leads, lang }: { reason: "phone" | "email"; value: string; leads: GroupLead[]; lang: "es" | "en" }) {
  const t = COPY[lang];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [keep, ...others] = leads;

  function merge() {
    startTransition(async () => {
      try {
        for (const dup of others) await mergeLeads(keep.id, dup.id);
        toast.success(t.done);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(getErrorMessage(e, t.error));
        router.refresh();
      }
    });
  }

  const Icon = reason === "phone" ? Phone : Mail;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Icon className="h-4 w-4 text-amber-600" />
          {reason === "phone" ? t.samePhone : t.sameEmail}: <span className="font-normal text-slate-500">{value}</span>
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>{t.merge}</Button>
      </header>
      <ul className="divide-y divide-slate-100">
        {leads.map((l, i) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">
                {l.name}
                {i === 0 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{t.keep}</span>}
              </p>
              <p className="truncate text-slate-500">
                {[l.phone, l.email, l.source].filter(Boolean).join(" · ")} · {new Date(l.createdAt).toLocaleDateString(lang === "es" ? "es-MX" : "en-US")}
              </p>
            </div>
            <StatusBadge status={l.status} />
            <Link href={`/portal/leads/${l.id}`} className="text-brand-700 hover:underline">{t.open}</Link>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.confirmTitle}</DialogTitle>
            <DialogDescription>{t.confirmDesc(keep.name, others.length)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>{t.cancel}</Button>
            <Button onClick={merge} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

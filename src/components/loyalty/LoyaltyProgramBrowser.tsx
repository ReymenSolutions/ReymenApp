"use client";
import { useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { viewLoyaltyProgram } from "@/actions/loyalty";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/user-error";

export function LoyaltyProgramBrowser({ programs, selectedId, lang }: {
  programs: { id: string; name: string; status: string; _count: { members: number; visits: number } }[];
  selectedId: string;
  lang: string;
}) {
  const [pending, start] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  // A member profile browses that customer's memberships, independently of the list filter.
  if (!programs.length || /^\/portal\/loyalty\/members\/[^/]+/.test(pathname)) return null;
  const current = programs.find(p => p.id === selectedId);
  return <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4" aria-label={lang === "es" ? "Programa consultado" : "Program being viewed"}>
    <label className="block text-sm font-semibold" htmlFor="loyalty-browse-program">{lang === "es" ? "Consultar clientes y visitas de" : "View customers and visits for"}</label>
    <select id="loyalty-browse-program" className="mt-2 min-h-11 w-full max-w-lg rounded-lg border border-slate-300 bg-white px-3 text-sm" disabled={pending} value={selectedId} onChange={event => {
      const id = event.target.value;
      start(async () => {
        try { await viewLoyaltyProgram(id); router.replace(pathname); router.refresh(); }
        catch (error) { toast.error(getErrorMessage(error, lang === "es" ? "No se pudo consultar el programa" : "Unable to view program")); }
      });
    }}>
      {programs.map(p => <option value={p.id} key={p.id}>{p.name} · {p._count.members} {lang === "es" ? "clientes" : "customers"} · {p._count.visits} {lang === "es" ? "visitas" : "visits"}{p.status === "PAUSED" ? (lang === "es" ? " · Pausado" : " · Paused") : ""}</option>)}
    </select>
    <p className="mt-2 text-sm text-slate-500" role="status">{pending ? (lang === "es" ? "Cargando programa…" : "Loading program…") : (lang === "es" ? `Estás viendo ${current?.name ?? ""}. Los registros de los demás programas se conservan; selecciona otro para consultarlos. Esto no cambia dónde acumula visitas cada cliente.` : `You are viewing ${current?.name ?? ""}. Records in other programs are retained; select one to view them. This does not change where each customer earns visits.`)}</p>
  </section>;
}

export function LoyaltyListOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return /^\/portal\/loyalty\/members\/[^/]+/.test(pathname) ? null : <>{children}</>;
}

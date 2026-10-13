"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/context/preferences";
import { createOpportunity } from "@/actions/opportunities";
import { searchLeads } from "@/actions/leads";
import { getErrorMessage } from "@/lib/user-error";

interface LeadOption { id: string; name: string; email: string | null; phone: string | null }
interface StageOption { id: string; name: string }
interface UserOption { id: string; name: string | null; email: string }

export function CreateOpportunityDialog({
  stages,
  users,
  fixedLead,
}: {
  stages: StageOption[];
  users: UserOption[];
  /** When opened from a lead's own detail page, skip the lead search entirely. */
  fixedLead?: LeadOption;
}) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadOption[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(fixedLead ?? null);
  const [searching, setSearching] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [ownerId, setOwnerId] = useState<string>(users[0]?.id ?? "");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [closeDate, setCloseDate] = useState("");

  async function handleLeadSearch(q: string) {
    setLeadQuery(q);
    if (q.trim().length < 2) { setLeadResults([]); return; }
    setSearching(true);
    try {
      const results = await searchLeads(q);
      setLeadResults(results);
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit() {
    if (!selectedLead) {
      toast.error(lang === "es" ? "Selecciona un contacto" : "Select a contact");
      return;
    }
    if (!title.trim()) {
      toast.error(lang === "es" ? "El título es requerido" : "Title is required");
      return;
    }
    startTransition(async () => {
      try {
        await createOpportunity({
          leadId: selectedLead.id,
          pipelineStageId: stageId || undefined,
          title: title.trim(),
          amount: amount ? Number(amount) : undefined,
          currency,
          ownerId: ownerId || undefined,
          estimatedCloseDate: closeDate || undefined,
        });
        toast.success(lang === "es" ? "Oportunidad creada" : "Opportunity created");
        setOpen(false);
        setTitle(""); setAmount(""); setCloseDate(""); setLeadQuery(""); setLeadResults([]);
        if (!fixedLead) setSelectedLead(null);
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al crear la oportunidad" : "Error creating opportunity")));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {lang === "es" ? "Nueva oportunidad" : "New opportunity"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Nueva oportunidad" : "New opportunity"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!fixedLead && (
            <div className="space-y-2">
              <Label>{lang === "es" ? "Contacto *" : "Contact *"}</Label>
              {selectedLead ? (
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <span>{selectedLead.name}</span>
                  <button type="button" onClick={() => setSelectedLead(null)} className="text-xs text-slate-400 hover:text-slate-600">
                    {lang === "es" ? "Cambiar" : "Change"}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder={lang === "es" ? "Buscar por nombre, email o teléfono..." : "Search by name, email or phone..."}
                    value={leadQuery}
                    onChange={(e) => handleLeadSearch(e.target.value)}
                  />
                  {leadResults.length > 0 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {leadResults.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => { setSelectedLead(lead); setLeadResults([]); }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <p className="font-medium text-slate-900">{lead.name}</p>
                          <p className="text-xs text-slate-400">{lead.email ?? lead.phone ?? ""}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {searching && <p className="mt-1 text-xs text-slate-400">{lang === "es" ? "Buscando..." : "Searching..."}</p>}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="createopportunitydialog-f1">{lang === "es" ? "Título *" : "Title *"}</Label>
            <Input id="createopportunitydialog-f1"
              placeholder={lang === "es" ? "Ej. Paquete anual de mantenimiento" : "E.g. Annual maintenance package"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="createopportunitydialog-f2">{lang === "es" ? "Monto" : "Amount"}</Label>
              <Input id="createopportunitydialog-f2" type="number" min="0" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="createopportunitydialog-f3">{lang === "es" ? "Moneda" : "Currency"}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="createopportunitydialog-f3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="createopportunitydialog-f4">{lang === "es" ? "Etapa" : "Stage"}</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger id="createopportunitydialog-f4"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="createopportunitydialog-f5">{lang === "es" ? "Responsable" : "Owner"}</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger id="createopportunitydialog-f5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="createopportunitydialog-f6">{lang === "es" ? "Fecha estimada de cierre" : "Estimated close date"}</Label>
            <Input id="createopportunitydialog-f6" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Crear oportunidad" : "Create opportunity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createSmartcardDestinationTypeAction,
  updateSmartcardDestinationTypeLabelAction,
  toggleSmartcardDestinationTypeAction,
} from "@/actions/admin/smartcard-settings";
import type { SmartcardDestinationTypeAdminRow } from "@/lib/smartcard-admin";

/**
 * Mismo set de acciones que admin.reymen.mx's /settings para
 * destination_types: solo label/is_active se editan aquí (ver el comentario
 * de smartcard-admin.ts sobre por qué requires_profile/requires_url de un
 * tipo ya existente no se tocan desde ningún formulario).
 */
export function SmartcardDestinationTypesSection({
  initial,
  canEdit,
}: {
  initial: SmartcardDestinationTypeAdminRow[];
  canEdit: boolean;
}) {
  const [types, setTypes] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRequiresProfile, setNewRequiresProfile] = useState(false);
  const [newRequiresUrl, setNewRequiresUrl] = useState(true);
  const [newSortOrder, setNewSortOrder] = useState(() => initial.length + 1);

  function startEdit(t: SmartcardDestinationTypeAdminRow) {
    setEditingCode(t.code);
    setLabelDraft(t.label);
  }

  function saveLabel(code: string) {
    if (!labelDraft.trim()) {
      toast.error("El nombre visible es obligatorio.");
      return;
    }
    startTransition(async () => {
      const result = await updateSmartcardDestinationTypeLabelAction(code, labelDraft);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setTypes((prev) => prev.map((t) => (t.code === code ? { ...t, label: labelDraft.trim() } : t)));
      setEditingCode(null);
    });
  }

  function handleToggle(t: SmartcardDestinationTypeAdminRow) {
    startTransition(async () => {
      const result = await toggleSmartcardDestinationTypeAction(t.code, !t.isActive);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setTypes((prev) => prev.map((x) => (x.code === t.code ? { ...x, isActive: !x.isActive } : x)));
    });
  }

  function handleCreate() {
    const code = newCode.trim().toUpperCase();
    const label = newLabel.trim();
    if (!code || !label) {
      toast.error("Faltan campos obligatorios.");
      return;
    }
    startTransition(async () => {
      const result = await createSmartcardDestinationTypeAction({
        code,
        label,
        requiresProfile: newRequiresProfile,
        requiresUrl: newRequiresUrl,
        sortOrder: newSortOrder,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setTypes((prev) => [
        ...prev,
        { code, label, requiresProfile: newRequiresProfile, requiresUrl: newRequiresUrl, sortOrder: newSortOrder, isActive: true },
      ]);
      setNewCode("");
      setNewLabel("");
      setNewRequiresProfile(false);
      setNewRequiresUrl(true);
      setNewSortOrder((n) => n + 1);
      toast.success("Tipo de destino agregado.");
    });
  }

  return (
    <section className="mb-10">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Tipos de destino ({types.length})</h2>
      <p className="mb-3 text-sm text-slate-500">
        Solo el nombre visible y el estado se editan aquí. Si necesitas requisitos distintos (con/sin perfil, con/sin URL), da de
        alta un tipo nuevo.
      </p>

      <Card>
        <CardContent className="flex flex-col divide-y divide-slate-100 p-0">
          {types.map((t) => (
            <div key={t.code} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="w-40 shrink-0 font-mono text-xs text-slate-400">{t.code}</span>
                {canEdit && editingCode === t.code ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      className="h-7 w-40 text-sm"
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => saveLabel(t.code)}>
                      Guardar
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => canEdit && startEdit(t)}
                    className={canEdit ? "underline-offset-2 hover:underline" : ""}
                  >
                    {t.label}
                  </button>
                )}
                <span className="text-xs text-slate-400">{t.requiresProfile ? "requiere perfil" : t.requiresUrl ? "requiere URL" : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={t.isActive ? "default" : "outline"}>{t.isActive ? "Activo" : "Inactivo"}</Badge>
                {canEdit && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleToggle(t)}>
                    {t.isActive ? "Desactivar" : "Reactivar"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-dashed border-slate-300 p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="smartcarddestinationtypessection-f1" className="text-xs">Código</Label>
            <Input id="smartcarddestinationtypessection-f1" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="TIKTOK" className="h-8 w-32" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="smartcarddestinationtypessection-f2" className="text-xs">Nombre visible</Label>
            <Input id="smartcarddestinationtypessection-f2" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="TikTok" className="h-8 w-40" />
          </div>
          <label className="flex items-center gap-1 text-xs text-slate-700">
            <input type="checkbox" className="h-3.5 w-3.5" checked={newRequiresProfile} onChange={(e) => setNewRequiresProfile(e.target.checked)} />
            requiere perfil
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-700">
            <input type="checkbox" className="h-3.5 w-3.5" checked={newRequiresUrl} onChange={(e) => setNewRequiresUrl(e.target.checked)} />
            requiere URL
          </label>
          <div className="flex flex-col gap-1">
            <Label htmlFor="smartcarddestinationtypessection-f3" className="text-xs">Orden</Label>
            <Input id="smartcarddestinationtypessection-f3"
              type="number"
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(Number(e.target.value) || 0)}
              className="h-8 w-16"
            />
          </div>
          <Button size="sm" disabled={pending} onClick={handleCreate}>
            + Agregar tipo
          </Button>
        </div>
      )}
    </section>
  );
}

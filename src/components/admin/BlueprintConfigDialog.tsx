"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, RotateCcw, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBlueprintConfigForm, saveBlueprintConfig, type BlueprintConfigForm, type ConfigFieldError } from "@/actions/admin/blueprints";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { CONFIG_GROUPS, GROUP_COPY, type ConfigFieldView } from "@/lib/automation/config-ui";

const COPY = {
  es: {
    title: (name: string) => `Configurar: ${name}`,
    desc: "Ajusta cómo se comporta esta automatización para este cliente. Cada valor muestra el de fábrica para que sepas qué cambiaste.",
    tz: "Zona horaria del negocio",
    tzHint: "Las horas de esta pantalla son hora local del negocio.",
    liveWarn: "Esta automatización está en envío real: los cambios aplican de inmediato a los siguientes mensajes.",
    default: "De fábrica",
    changed: "Modificado",
    reset: "Restaurar",
    resetAll: "Restaurar todo",
    cancel: "Cancelar",
    save: "Guardar cambios",
    saved: "Configuración guardada",
    noChanges: "Sin cambios",
    loadError: "No se pudo cargar la configuración",
    saveError: "No se pudo guardar",
    hour: (h: number) => `${String(h).padStart(2, "0")}:00`,
    errors: {
      invalid: "Valor no válido",
      not_integer: "Escribe un número",
      too_small: (min?: number) => `Mínimo ${min}`,
      too_big: (max?: number) => `Máximo ${max}`,
      must_be_less: (other: string) => `Debe ser menor que «${other}»`,
      required: "Obligatorio con este canal",
    },
    none: "Sin definir",
  },
  en: {
    title: (name: string) => `Configure: ${name}`,
    desc: "Adjust how this automation behaves for this client. Each value shows the factory default so you can see what you changed.",
    tz: "Business time zone",
    tzHint: "Hours on this screen are the business's local time.",
    liveWarn: "This automation is live: changes apply immediately to the next messages.",
    default: "Default",
    changed: "Changed",
    reset: "Reset",
    resetAll: "Reset all",
    cancel: "Cancel",
    save: "Save changes",
    saved: "Configuration saved",
    noChanges: "No changes",
    loadError: "Couldn't load the configuration",
    saveError: "Couldn't save",
    hour: (h: number) => `${String(h).padStart(2, "0")}:00`,
    errors: {
      invalid: "Invalid value",
      not_integer: "Enter a number",
      too_small: (min?: number) => `Minimum ${min}`,
      too_big: (max?: number) => `Maximum ${max}`,
      must_be_less: (other: string) => `Must be less than “${other}”`,
      required: "Required with this channel",
    },
    none: "Not set",
  },
};

type Values = Record<string, string | number | null>;

/** Presentación del valor de fábrica de un campo (para "De fábrica: 14 días"). */
function formatValue(f: ConfigFieldView, value: string | number | null | undefined, lang: "es" | "en", t: (typeof COPY)["es"]) {
  if (value === null || value === undefined || value === "") return t.none;
  if (f.kind === "hour") return t.hour(Number(value));
  if (f.kind === "select") return f.options?.find((o) => o.value === value)?.label[lang] ?? String(value);
  return `${value}${f.unit ? ` ${f.unit[lang]}` : ""}`;
}

export function BlueprintConfigDialog({ orgId, blueprintKey, onClose }: { orgId: string; blueprintKey: string | null; onClose: () => void }) {
  const { lang: rawLang } = usePreferences();
  const lang = rawLang === "en" ? "en" : "es";
  const t = COPY[lang];
  const [form, setForm] = useState<BlueprintConfigForm | null>(null);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, ConfigFieldError>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!blueprintKey) return;
    let cancelled = false;
    setForm(null);
    setErrors({});
    getBlueprintConfigForm({ orgId, key: blueprintKey })
      .then((f) => {
        if (cancelled) return;
        setForm(f);
        setValues(f.values);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(t.loadError, { description: getErrorMessage(e, "") || undefined });
        onClose();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, blueprintKey]);

  const dirty = !!form && form.fields.some((f) => (values[f.key] ?? null) !== (form.values[f.key] ?? null));

  function set(key: string, value: string | number | null) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
  }

  function save() {
    if (!form || !dirty || pending) return;
    start(async () => {
      try {
        const res = await saveBlueprintConfig({ orgId, key: form.key, config: values });
        if (!res.success) {
          setErrors(res.errors);
          return;
        }
        toast.success(res.changed.length ? t.saved : t.noChanges);
        onClose();
      } catch (e) {
        toast.error(t.saveError, { description: getErrorMessage(e, "") || undefined });
      }
    });
  }

  const errorText = (f: ConfigFieldView) => {
    const e = errors[f.key];
    if (!e) return null;
    if (e.code === "too_small") return t.errors.too_small(e.min);
    if (e.code === "too_big") return t.errors.too_big(e.max);
    if (e.code === "required") return t.errors.required;
    if (e.code === "must_be_less") return t.errors.must_be_less(form?.fields.find((x) => x.key === e.other)?.label[lang] ?? e.other ?? "");
    return t.errors[e.code];
  };

  return (
    <Dialog open={blueprintKey !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.title(form?.name ?? "")}</DialogTitle>
          <DialogDescription>{t.desc}</DialogDescription>
        </DialogHeader>

        {!form ? (
          <div className="flex justify-center py-10" aria-busy="true">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
              <Globe2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {t.tz}: <strong>{form.timezone}</strong>. {t.tzHint}
              </span>
            </div>
            {form.live && <p role="note" className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">{t.liveWarn}</p>}

            {CONFIG_GROUPS.map((group) => {
              const fields = form.fields.filter((f) => f.group === group);
              if (fields.length === 0) return null;
              return (
                <section key={group} aria-label={GROUP_COPY[group][lang].title} className="rounded-card border border-slate-200">
                  <header className="border-b border-slate-100 px-3 py-2">
                    <h3 className="text-sm font-semibold text-slate-900">{GROUP_COPY[group][lang].title}</h3>
                    <p className="text-xs text-slate-500">{GROUP_COPY[group][lang].hint}</p>
                  </header>
                  <div className="divide-y divide-slate-100">
                    {fields.map((f) => {
                      const value = values[f.key] ?? null;
                      const isDefault = (value ?? null) === (f.defaultValue ?? null);
                      const id = `cfg-${f.key}`;
                      const err = errorText(f);
                      return (
                        <div key={f.key} className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_12rem] sm:items-start">
                          <div className="min-w-0">
                            <label htmlFor={id} className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                              {f.label[lang]}
                              {!isDefault && <Badge variant="info" className="text-[10px]">{t.changed}</Badge>}
                            </label>
                            <p className="text-xs text-slate-500">{f.help[lang]}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {t.default}: {formatValue(f, f.defaultValue, lang, t)}
                              {!isDefault && (
                                <button type="button" onClick={() => set(f.key, f.defaultValue)} className="ml-2 inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">
                                  <RotateCcw className="h-3 w-3" /> {t.reset}
                                </button>
                              )}
                            </p>
                          </div>
                          <div>
                            {f.kind === "select" ? (
                              <select id={id} value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} className="h-9 w-full rounded-md border border-slate-200 bg-transparent px-2 text-sm">
                                {f.options?.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label[lang]}
                                  </option>
                                ))}
                              </select>
                            ) : f.kind === "hour" ? (
                              <select id={id} value={String(value ?? 0)} onChange={(e) => set(f.key, Number(e.target.value))} aria-invalid={!!err} className="h-9 w-full rounded-md border border-slate-200 bg-transparent px-2 text-sm">
                                {Array.from({ length: 24 }, (_, h) => (
                                  <option key={h} value={h}>
                                    {t.hour(h)}
                                  </option>
                                ))}
                              </select>
                            ) : f.kind === "phone" ? (
                              <Input id={id} type="tel" inputMode="tel" placeholder="+5215512345678" value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} />
                            ) : f.kind === "url" ? (
                              <Input id={id} type="url" inputMode="url" placeholder="https://…" value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} aria-invalid={!!err} />
                            ) : (
                              <div className="flex items-center gap-2">
                                <Input id={id} type="number" min={f.min} max={f.max} step={f.step} value={value ?? ""} onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))} aria-invalid={!!err} />
                                {f.unit && <span className="whitespace-nowrap text-xs text-slate-500">{f.unit[lang]}</span>}
                              </div>
                            )}
                            {f.kind === "number" && (f.min !== undefined || f.max !== undefined) && <p className="mt-0.5 text-[11px] text-slate-400">{f.min ?? "…"} – {f.max ?? "…"}</p>}
                            {err && <p role="alert" className="mt-1 text-xs text-red-600">{err}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          {form && form.fields.some((f) => (values[f.key] ?? null) !== (f.defaultValue ?? null)) && (
            <Button type="button" variant="ghost" className="mr-auto" onClick={() => setValues(Object.fromEntries(form.fields.map((f) => [f.key, f.defaultValue])))}>
              <RotateCcw className="h-3.5 w-3.5" /> {t.resetAll}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={save} disabled={!dirty || pending} loading={pending}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

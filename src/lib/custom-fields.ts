import type { CustomFieldType } from "@prisma/client";

/** Máximo de campos personalizados por organización (activos o archivados). */
export const MAX_CUSTOM_FIELDS = 20;
const MAX_TEXT = 500;
const MAX_OPTIONS = 30;
const MAX_OPTION_LENGTH = 60;
const MAX_LABEL = 60;

export type CustomValue = string | number | boolean;

export interface CustomFieldDef {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
}

/** "Fecha de nacimiento" → "fecha_de_nacimiento": sin acentos, minúsculas y guiones bajos. */
export function keyFromLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return base || "campo";
}

/** Si la clave ya existe, agrega _2, _3… */
export function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export function cleanLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);
}

/** Opciones de una lista: sin vacíos ni repetidas (sin distinguir mayúsculas), con límite. Acepta texto separado por comas o saltos de línea. */
export function normalizeOptions(raw: string[] | string | null | undefined): string[] {
  const list = Array.isArray(raw) ? raw : (raw ?? "").split(/[\n,]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const o = item.trim().replace(/\s+/g, " ").slice(0, MAX_OPTION_LENGTH);
    if (!o || seen.has(o.toLowerCase())) continue;
    seen.add(o.toLowerCase());
    out.push(o);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out;
}

export type CoerceResult = { ok: true; value: CustomValue | null } | { ok: false };

const TRUE_WORDS = new Set(["true", "1", "si", "sí", "yes", "on"]);
const FALSE_WORDS = new Set(["false", "0", "no", "off"]);

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Convierte lo que llegó (formulario, webhook) al valor que se guarda según el
 * tipo del campo. Vacío significa "quitar el valor" (null). Si no es válido,
 * { ok: false }: nunca se guarda un dato que no corresponde al tipo.
 */
export function coerceValue(field: Pick<CustomFieldDef, "type" | "options">, raw: unknown): CoerceResult {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };

  switch (field.type) {
    case "TEXT": {
      if (typeof raw !== "string" && typeof raw !== "number") return { ok: false };
      const text = String(raw).trim();
      return text.length > MAX_TEXT ? { ok: false } : { ok: true, value: text };
    }
    case "NUMBER": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(/,/g, "")) : NaN;
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case "DATE": {
      if (typeof raw !== "string") return { ok: false };
      const iso = raw.trim().slice(0, 10);
      return isRealDate(iso) ? { ok: true, value: iso } : { ok: false };
    }
    case "SELECT": {
      if (typeof raw !== "string") return { ok: false };
      const match = field.options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());
      return match ? { ok: true, value: match } : { ok: false };
    }
    case "BOOLEAN": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (typeof raw === "string") {
        const w = raw.trim().toLowerCase();
        if (TRUE_WORDS.has(w)) return { ok: true, value: true };
        if (FALSE_WORDS.has(w)) return { ok: true, value: false };
      }
      return { ok: false };
    }
  }
}

export interface SanitizeResult {
  values: Record<string, CustomValue>;
  /** Campos cuyo valor no era válido (se ignoran; los demás sí se guardan). */
  invalid: string[];
}

/**
 * Aplica `input` sobre los valores `existing` del contacto, solo para los
 * campos que existen y están activos: las claves desconocidas se ignoran, un
 * vacío quita el valor y un valor que no corresponde al tipo se reporta en
 * `invalid` sin tocar el que había.
 */
export function sanitizeCustomFields(fields: CustomFieldDef[], input: Record<string, unknown>, existing?: unknown): SanitizeResult {
  const values: Record<string, CustomValue> = {};
  const byKey = new Map(fields.map((f) => [f.key, f]));
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [k, v] of Object.entries(existing as Record<string, unknown>)) {
      if ((typeof v === "string" || typeof v === "number" || typeof v === "boolean") && byKey.has(k)) values[k] = v;
    }
  }
  const invalid: string[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const field = byKey.get(key);
    if (!field) continue;
    const res = coerceValue(field, raw);
    if (!res.ok) {
      invalid.push(key);
      continue;
    }
    if (res.value === null) delete values[key];
    else values[key] = res.value;
  }
  return { values, invalid };
}

/** Texto para mostrar o exportar. */
export function displayValue(field: Pick<CustomFieldDef, "type">, value: unknown, lang: "es" | "en" = "es"): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "BOOLEAN") return value === true ? (lang === "es" ? "Sí" : "Yes") : lang === "es" ? "No" : "No";
  if (field.type === "DATE" && typeof value === "string" && isRealDate(value)) {
    return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  }
  if (field.type === "NUMBER" && typeof value === "number") return new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US").format(value);
  return String(value);
}

/** Valor tal como lo espera un <input> de HTML. */
export function inputValue(field: Pick<CustomFieldDef, "type">, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "BOOLEAN") return value === true ? "true" : value === false ? "false" : "";
  return String(value);
}

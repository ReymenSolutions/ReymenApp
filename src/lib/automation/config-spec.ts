import { z, type ZodTypeAny } from "zod";
import { CONFIG_GROUPS, type ConfigFieldMeta, type ConfigUi } from "./config-ui";
import type { Blueprint } from "./types";
import { E164 } from "./notify";

// ── Parámetros declarados como DATOS (plantillas n8n) ────────────────────────
// Un blueprint declara sus parámetros en código (Zod + `configUi`). Una versión de plantilla n8n no tiene código en
// Reymen, así que los declara en un JSON con el MISMO formato de presentación (grupo, título, ayuda, unidad, opciones)
// más lo que en el blueprint dice el esquema (tipo, límites, valor de fábrica, obligatorio). `compileConfigSpec` lo
// convierte en esquema + presentación y, desde ahí, el formulario del Admin, la validación y los valores de fábrica
// son EXACTAMENTE los de los blueprints: una sola pantalla y un solo validador para ambos.

const bilingual = (max: number) => z.object({ es: z.string().min(1).max(max), en: z.string().min(1).max(max) }).strict();

const fieldDecl = z
  .object({
    kind: z.enum(["number", "hour", "select", "url", "phone", "text"]),
    group: z.enum(CONFIG_GROUPS),
    label: bilingual(80),
    help: bilingual(400),
    unit: bilingual(20).optional(),
    default: z.union([z.string().max(500), z.number()]).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    integer: z.boolean().optional(),
    maxLength: z.number().int().min(1).max(500).optional(),
    options: z.record(z.string().min(1).max(60), bilingual(80)).optional(),
    required: z.boolean().optional(),
    ownerEditable: z.boolean().optional(),
  })
  .strict();

export const configSpecSchema = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), fieldDecl).refine((o) => Object.keys(o).length > 0 && Object.keys(o).length <= 40, "entre 1 y 40 parámetros");

export type ConfigSpec = z.infer<typeof configSpecSchema>;
type SpecField = z.infer<typeof fieldDecl>;

/** Esquema Zod de un parámetro (sin su valor de fábrica ni su obligatoriedad: eso lo decide `compileConfigSpec`). */
function baseSchema(f: SpecField): ZodTypeAny {
  switch (f.kind) {
    case "number": {
      let s = z.number();
      if (f.integer) s = s.int();
      if (f.min !== undefined) s = s.min(f.min);
      if (f.max !== undefined) s = s.max(f.max);
      return s;
    }
    case "hour":
      return z.number().int().min(0).max(23);
    case "select":
      return z.enum(Object.keys(f.options ?? {}) as [string, ...string[]]);
    case "url":
      return z.string().url().max(f.maxLength ?? 500).or(z.literal(""));
    case "phone":
      return z.string().regex(E164).or(z.literal(""));
    case "text":
      return z.string().max(f.maxLength ?? 200);
  }
}

const isText = (f: SpecField) => f.kind === "url" || f.kind === "phone" || f.kind === "text";

/**
 * Comprueba la declaración (formas, límites coherentes, opciones, valor de fábrica que cumpla su propio esquema).
 * Devuelve los problemas legibles; vacío = válida.
 */
export function validateConfigSpec(raw: unknown): { ok: true; spec: ConfigSpec } | { ok: false; errors: string[] } {
  const parsed = configSpecSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`) };
  const errors: string[] = [];
  for (const [key, f] of Object.entries(parsed.data)) {
    if (f.kind === "select" && (!f.options || Object.keys(f.options).length === 0)) errors.push(`${key}: un select necesita opciones`);
    if (f.kind !== "select" && f.options) errors.push(`${key}: solo un select lleva opciones`);
    if (f.kind !== "number" && (f.min !== undefined || f.max !== undefined || f.integer !== undefined || f.unit)) errors.push(`${key}: mínimo, máximo, entero y unidad son solo de campos numéricos`);
    if (f.kind !== "number" && f.kind !== "hour" && f.kind !== "select" && typeof f.default === "number") errors.push(`${key}: el valor de fábrica debe ser texto`);
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) errors.push(`${key}: el mínimo no puede ser mayor que el máximo`);
    if (f.default !== undefined && !baseSchema(f).safeParse(f.default).success) errors.push(`${key}: el valor de fábrica no cumple su propio esquema`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, spec: parsed.data };
}

export type CompiledConfig = Pick<Blueprint<Record<string, unknown>>, "configSchema" | "defaultConfig" | "configUi" | "crossCheck">;

/** Declaración → esquema + valores de fábrica + presentación, en el formato que ya consume el formulario de blueprints. */
export function compileConfigSpec(spec: ConfigSpec): CompiledConfig {
  const shape: Record<string, ZodTypeAny> = {};
  const defaults: Record<string, unknown> = {};
  const ui: Record<string, ConfigFieldMeta> = {};
  const requiredText: string[] = [];
  for (const [key, f] of Object.entries(spec)) {
    let s = baseSchema(f);
    if (f.default !== undefined) {
      s = s.default(f.default);
      defaults[key] = f.default;
    } else if (isText(f) || !f.required) {
      // Sin valor de fábrica: puede quedar vacío (las llaves de texto obligatorias se verifican en `crossCheck`).
      s = isText(f) ? s.optional() : s.nullable().optional();
    }
    if (f.required && isText(f)) requiredText.push(key);
    shape[key] = s;
    ui[key] = {
      group: f.group,
      kind: f.kind,
      label: f.label,
      help: f.help,
      unit: f.unit,
      options: f.options,
      ownerEditable: f.ownerEditable,
      maxLength: f.maxLength,
    };
  }
  return {
    configSchema: z.object(shape) as unknown as CompiledConfig["configSchema"],
    defaultConfig: defaults,
    configUi: ui as unknown as ConfigUi<Record<string, unknown>>,
    crossCheck: requiredText.length ? (config) => requiredText.filter((k) => !(config as Record<string, unknown>)[k]).map((key) => ({ key, code: "required" as const }))[0] ?? null : undefined,
  };
}

/** Llaves que el dueño del negocio puede editar desde su portal. */
export function ownerEditableKeys(spec: ConfigSpec): string[] {
  return Object.entries(spec).filter(([, f]) => f.ownerEditable).map(([k]) => k);
}

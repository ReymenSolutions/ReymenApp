import type { Automation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBlueprint } from "./blueprints";
import { compileConfigSpec, validateConfigSpec, type CompiledConfig, type ConfigSpec } from "./config-spec";
import { describeConfig } from "./config-ui";

/**
 * Una sola configuración por automatización: `Automation.config`. De dónde salen sus parámetros depende de qué es:
 *  - un blueprint → los declara el código (Zod + `configUi`);
 *  - una plantilla n8n → los declara su versión (`TemplateVersion.configSpec`), compilada al mismo formato.
 * El formulario del Admin, la validación y los valores de fábrica son los mismos para ambos.
 */
export type ConfigSource = {
  kind: "blueprint" | "template";
  name: string;
  version: string;
  compiled: CompiledConfig;
  /** Solo plantillas: la declaración original (para saber qué campos puede editar el dueño). */
  spec?: ConfigSpec;
};

export type ConfigFieldError = { code: "invalid" | "too_small" | "too_big" | "not_integer" | "must_be_less" | "required"; min?: number; max?: number; other?: string };

type Subject = Pick<Automation, "id" | "name" | "blueprintKey" | "blueprintVersion">;

/** Los parámetros de esta automatización, o null si no declara ninguno (una plantilla heredada sin `configSpec`). */
export async function resolveConfigSource(automation: Subject): Promise<ConfigSource | null> {
  if (automation.blueprintKey) {
    const blueprint = getBlueprint(automation.blueprintKey, automation.blueprintVersion);
    return blueprint ? { kind: "blueprint", name: blueprint.name, version: String(blueprint.version), compiled: blueprint } : null;
  }
  const installation = await prisma.templateInstallation.findFirst({
    where: { automationId: automation.id, status: "ACTIVE" },
    select: { version: { select: { version: true, configSpec: true } }, template: { select: { name: true } } },
  });
  if (!installation?.version.configSpec) return null;
  const checked = validateConfigSpec(installation.version.configSpec);
  if (!checked.ok) return null;
  return { kind: "template", name: installation.template.name, version: installation.version.version, compiled: compileConfigSpec(checked.spec), spec: checked.spec };
}

/** Valores vigentes: lo guardado sobre lo de fábrica (si lo guardado ya no cumple el esquema, se muestran los de fábrica). */
export function currentConfigValues(source: ConfigSource, stored: unknown): Record<string, string | number | null> {
  const parsed = source.compiled.configSchema.safeParse(stored ?? {});
  return (parsed.success ? parsed.data : source.compiled.defaultConfig) as Record<string, string | number | null>;
}

export function configFields(source: ConfigSource) {
  return describeConfig(source.compiled);
}

/** Parámetros que el dueño del negocio puede editar desde su portal (los marcados `ownerEditable`); el resto es del admin. */
export function ownerEditableFields(source: ConfigSource) {
  return configFields(source).filter((f) => f.ownerEditable);
}

export type ConfigUpdate = { ok: true; after: Record<string, unknown>; before: Record<string, unknown>; changed: string[] } | { ok: false; errors: Record<string, ConfigFieldError> };

/**
 * Valida un cambio de parámetros: ignora llaves desconocidas (o fuera de `allowed`), valida con el esquema (límites
 * incluidos) y con la coherencia entre parámetros, y dice qué cambió. No escribe nada.
 */
export function validateConfigUpdate(source: ConfigSource, stored: unknown, incomingRaw: Record<string, unknown>, allowed?: Set<string>): ConfigUpdate {
  const known = new Set(configFields(source).map((f) => f.key));
  const incoming = Object.fromEntries(Object.entries(incomingRaw ?? {}).filter(([k]) => known.has(k) && (!allowed || allowed.has(k))));
  const before = currentConfigValues(source, stored) as Record<string, unknown>;
  const result = source.compiled.configSchema.safeParse({ ...before, ...incoming });
  if (!result.success) {
    const errors: Record<string, ConfigFieldError> = {};
    for (const issue of result.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (!k || errors[k]) continue;
      errors[k] = issue.code === "too_small" ? { code: "too_small", min: Number((issue as { minimum?: number }).minimum) } : issue.code === "too_big" ? { code: "too_big", max: Number((issue as { maximum?: number }).maximum) } : issue.code === "invalid_type" && (issue as { expected?: string }).expected === "number" ? { code: "not_integer" } : { code: "invalid" };
    }
    return { ok: false, errors };
  }
  const cross = source.compiled.crossCheck?.(result.data);
  if (cross) return { ok: false, errors: { [cross.key]: cross.code === "required" ? { code: "required" } : { code: cross.code, other: cross.other } } };
  const after = result.data as Record<string, unknown>;
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k] ?? null) !== JSON.stringify(before[k] ?? null));
  return { ok: true, after, before, changed };
}

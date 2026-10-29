import { z, type ZodTypeAny } from "zod";
import type { Blueprint } from "./types";

// ── Configuración de blueprints en el Admin ──────────────────────────────────
// El formulario se genera desde el configSchema (Zod) de cada blueprint: límites y valores por defecto salen del
// esquema; cada parámetro declara además cómo se presenta (título, ayuda, grupo, unidad). Una prueba exige que NINGÚN
// parámetro quede sin presentación, para que nada de lo configurable se quede fuera de la pantalla.

export const CONFIG_GROUPS = ["when", "who", "channel", "limits", "extras"] as const;
export type ConfigGroup = (typeof CONFIG_GROUPS)[number];

/** Cómo se ordena y se titula cada sección del formulario. */
export const GROUP_COPY: Record<ConfigGroup, { es: { title: string; hint: string }; en: { title: string; hint: string } }> = {
  when: { es: { title: "Cuándo actúa", hint: "Qué tiene que pasar para que la automatización entre en acción." }, en: { title: "When it acts", hint: "What has to happen for the automation to kick in." } },
  who: { es: { title: "A quién", hint: "Qué clientes cuentan." }, en: { title: "Who", hint: "Which customers count." } },
  channel: { es: { title: "Canal y horario", hint: "Por dónde se contacta y en qué horas no se molesta." }, en: { title: "Channel and hours", hint: "How customers are contacted and when they are left alone." } },
  limits: { es: { title: "Límites", hint: "Cada cuánto como máximo y hasta cuándo." }, en: { title: "Limits", hint: "How often at most, and up to when." } },
  extras: { es: { title: "Opcionales", hint: "Ajustes que no cambian cuándo ni a quién." }, en: { title: "Optional", hint: "Settings that don't change when or to whom." } },
};

export type ConfigFieldMeta = {
  group: ConfigGroup;
  kind: "number" | "hour" | "select" | "url" | "phone" | "text";
  label: { es: string; en: string };
  help: { es: string; en: string };
  unit?: { es: string; en: string };
  /** Etiquetas de las opciones de un `select` (los valores salen del esquema). */
  options?: Record<string, { es: string; en: string }>;
  /** El dueño del negocio puede editarlo desde su portal (un subconjunto seguro; por defecto solo el admin). */
  ownerEditable?: boolean;
  /** Longitud máxima de un campo `text`. */
  maxLength?: number;
};

/** Presentación de los parámetros de un blueprint: una entrada por cada llave de su configuración. */
export type ConfigUi<C> = { [K in keyof C]-?: ConfigFieldMeta };

export const UNIT = {
  days: { es: "días", en: "days" },
  minutes: { es: "minutos", en: "minutes" },
  visits: { es: "visitas", en: "visits" },
  times: { es: "veces", en: "times" },
} as const;

/** Campos reutilizados por varios blueprints (mismo texto, misma presentación). */
export const COMMON = {
  channel: { group: "channel", kind: "select", label: { es: "Canal de envío", en: "Sending channel" }, help: { es: "Por dónde se escribe al cliente.", en: "How the customer is contacted." }, options: { whatsapp: { es: "WhatsApp", en: "WhatsApp" }, sms: { es: "SMS", en: "SMS" } } },
  quietStart: { ownerEditable: true, group: "channel", kind: "hour", label: { es: "No molestar desde las", en: "Do not disturb from" }, help: { es: "Hora local del negocio en que empieza el silencio. Nada se envía entre esta hora y la siguiente.", en: "Local business time when quiet hours start. Nothing is sent between this hour and the next." } },
  quietEnd: { ownerEditable: true, group: "channel", kind: "hour", label: { es: "No molestar hasta las", en: "Do not disturb until" }, help: { es: "Hora local del negocio en que termina el silencio.", en: "Local business time when quiet hours end." } },
} satisfies Record<string, ConfigFieldMeta>;

export type ConfigFieldView = {
  key: string;
  group: ConfigGroup;
  kind: ConfigFieldMeta["kind"];
  label: { es: string; en: string };
  help: { es: string; en: string };
  unit?: { es: string; en: string };
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: { es: string; en: string } }[];
  defaultValue: string | number | null;
  ownerEditable: boolean;
  maxLength?: number;
};

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let s = schema;
  for (let i = 0; i < 6; i++) {
    if (s instanceof z.ZodDefault || s instanceof z.ZodOptional || s instanceof z.ZodNullable) s = s.unwrap() as ZodTypeAny;
    else break;
  }
  return s;
}

function numberBounds(schema: ZodTypeAny): { min?: number; max?: number; int: boolean } {
  const base = unwrap(schema);
  if (!(base instanceof z.ZodNumber)) return { int: false };
  return { min: base.minValue ?? undefined, max: base.maxValue ?? undefined, int: base.isInt };
}

/** Los parámetros de un blueprint, en el orden de sus secciones, con límites y valores por defecto tomados de su esquema. */
export function describeConfig(blueprint: Pick<Blueprint, "configSchema" | "defaultConfig" | "configUi">): ConfigFieldView[] {
  const shape = (blueprint.configSchema as unknown as z.ZodObject<Record<string, ZodTypeAny>>).shape ?? {};
  const defaults = blueprint.defaultConfig as Record<string, unknown>;
  const ui = (blueprint.configUi ?? {}) as Record<string, ConfigFieldMeta>;
  const fields: ConfigFieldView[] = [];
  for (const key of Object.keys(shape)) {
    const meta = ui[key];
    if (!meta) continue;
    const base = unwrap(shape[key]);
    const { min, max, int } = numberBounds(shape[key]);
    const enumValues = base instanceof z.ZodEnum ? (base.options as string[]) : undefined;
    const kind = meta.kind;
    fields.push({
      key,
      group: meta.group,
      kind,
      label: meta.label,
      help: meta.help,
      unit: meta.unit,
      min: kind === "hour" ? 0 : min,
      max: kind === "hour" ? 23 : max,
      step: kind === "number" && !int ? 0.1 : 1,
      options: enumValues?.map((value) => ({ value, label: meta.options?.[value] ?? { es: value, en: value } })),
      defaultValue: (defaults[key] as string | number | undefined) ?? null,
      ownerEditable: meta.ownerEditable === true,
      maxLength: kind === "text" ? meta.maxLength : undefined,
    });
  }
  return fields.sort((a, b) => CONFIG_GROUPS.indexOf(a.group) - CONFIG_GROUPS.indexOf(b.group));
}

/** Llaves del esquema que no tienen presentación (debe ser vacío: lo comprueba una prueba). */
export function missingConfigUi(blueprint: Pick<Blueprint, "configSchema" | "configUi">): string[] {
  const shape = (blueprint.configSchema as unknown as z.ZodObject<Record<string, ZodTypeAny>>).shape ?? {};
  const ui = (blueprint.configUi ?? {}) as Record<string, unknown>;
  return Object.keys(shape).filter((k) => !ui[k]);
}

/** Aviso interno: por dónde llega además de la campana del portal (los destinatarios y el mensaje los arma Reymen; n8n solo entrega). */
export const NOTIFY_FIELDS = {
  notify: {
    group: "channel",
    kind: "select",
    label: { es: "Avisar además por", en: "Also notify by" },
    help: { es: "La campana del portal siempre avisa. Aquí eliges si además llega por correo (a dueños y gerentes activos) y/o por WhatsApp (al número de abajo).", en: "The portal bell always notifies. Here you choose whether it also arrives by email (to active owners and managers) and/or WhatsApp (to the number below)." },
    options: { app: { es: "Solo la campana", en: "Bell only" }, email: { es: "Correo", en: "Email" }, whatsapp: { es: "WhatsApp", en: "WhatsApp" }, email_whatsapp: { es: "Correo y WhatsApp", en: "Email and WhatsApp" } },
  },
  whatsappTo: {
    group: "channel",
    kind: "phone",
    label: { es: "WhatsApp del responsable", en: "Manager's WhatsApp" },
    help: { es: "Número en formato internacional, p. ej. +5215512345678. Solo se usa si el aviso incluye WhatsApp.", en: "Number in international format, e.g. +5215512345678. Only used if the notice includes WhatsApp." },
  },
} satisfies Record<string, ConfigFieldMeta>;

/** Grupo de control: porcentaje de clientes elegibles a quienes NO se les escribe, para medir si el mensaje de verdad provoca el regreso. */
export const CONTROL_FIELD = {
  group: "extras",
  kind: "number",
  label: { es: "Grupo de control", en: "Control group" },
  help: { es: "Porcentaje de clientes elegibles a quienes a propósito NO se les escribe, para medir si el mensaje de verdad provoca que regresen (se compara contra quienes sí lo reciben). 0 = apagado; 10 es lo habitual.", en: "Share of eligible customers who are deliberately NOT messaged, to measure whether the message really brings them back (compared against those who do receive it). 0 = off; 10 is typical." },
  unit: { es: "%", en: "%" },
} satisfies ConfigFieldMeta;

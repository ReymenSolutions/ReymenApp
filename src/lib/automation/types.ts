import type { Customer, PlatformModule } from "@prisma/client";
import type { ZodType, ZodTypeDef } from "zod";
import type { StoredDomainEvent } from "@/lib/domain-events";
import type { DailyReport } from "./report";
import type { ConfigUi } from "./config-ui";

export type MessageChannel = "whatsapp" | "sms";

/** Lo que una automatización quiere hacer (aún no se ha hecho: el despachador/dry-run lo trata). */
export type ActionSpec =
  | { type: "message"; channel: MessageChannel; templateKey: string; variables: Record<string, string> }
  /** Aviso interno para el equipo (campana del portal): no contacta a ningún cliente. */
  | { type: "alert"; severity: "warning" | "critical"; title: string; body: string; href: string }
  /** Reporte periódico para dueños y gerentes (correo + actividad del portal). */
  | { type: "report"; title: string; date: string; report: DailyReport };

export type BlueprintContext = {
  organization: { id: string; name: string; timezone: string };
  /** Cliente del evento (null si el evento no trae uno o ya no existe). */
  customer: Customer | null;
  now: Date;
};

export type BlueprintDecision = { kind: "skip"; reason: string } | { kind: "act"; action: ActionSpec };

/** Reglas de contacto que el motor aplica ANTES de crear la ejecución (la política es del motor, no del blueprint). */
export type ContactRules = {
  channel: MessageChannel;
  cooldownDays: number;
  /** Horas locales (0–23) en las que no se contacta; si start > end cruza la medianoche (p. ej. 21 → 9). */
  quietHours?: { start: number; end: number } | null;
  /** Retraso desde el evento hasta el envío (p. ej. 120 = 2 h después de la compra). El envío cae fuera de las horas de silencio. */
  delayMinutes?: number;
};

export type Blueprint<C = Record<string, unknown>> = {
  key: string;
  version: number;
  name: string;
  description: string;
  /** Tipo de DomainEvent que lo dispara. */
  trigger: string;
  /** A quién va dirigida: un cliente (por defecto; pasa por la política de contacto) o el equipo (aviso interno). */
  audience?: "customer" | "internal";
  requiredModules: PlatformModule[];
  /** Categorías de plantillas n8n (`AutomationTemplate.category`) que hacen un trabajo parecido: avisan al activar ambas. */
  overlapCategories?: string[];
  status: "active" | "deprecated";
  configSchema: ZodType<C, ZodTypeDef, unknown>;
  defaultConfig: C;
  /** Coherencia entre parámetros (p. ej. "desde" < "hasta"): devuelve la llave con el problema, o null si está bien. */
  crossCheck?: (config: C) => { key: string; code: "must_be_less"; other: string } | null;
  /** Cómo se presenta cada parámetro en el Admin (título, ayuda, sección, unidad). Uno por cada llave de `configSchema`. */
  configUi: ConfigUi<C>;
  /** Función pura: decide, a partir del evento y el contexto, si actuar y con qué. */
  decide: (event: StoredDomainEvent, ctx: BlueprintContext, config: C) => BlueprintDecision;
  /** Cómo se contacta (canal, enfriamiento, horario) según la configuración. */
  /**
   * Antes de crear la ejecución (nunca en dry-run con efectos): completa la acción con lo que necesita y no es puro,
   * por ejemplo crear el registro cuyo enlace va en el mensaje. `dryRun` = no escribir nada.
   */
  prepare?: (input: { organizationId: string; event: StoredDomainEvent; customer: Customer; action: ActionSpec; config: C; dryRun: boolean }) => Promise<ActionSpec>;
  /** Solo para audiencia de clientes. */
  contactRules: (config: C) => ContactRules;
};

import type { Customer, PlatformModule } from "@prisma/client";
import type { ZodType, ZodTypeDef } from "zod";
import type { StoredDomainEvent } from "@/lib/domain-events";

export type MessageChannel = "whatsapp" | "sms";

/** Lo que una automatización quiere hacer (aún no se ha hecho: el despachador/dry-run lo trata). */
export type ActionSpec = {
  type: "message";
  channel: MessageChannel;
  templateKey: string;
  variables: Record<string, string>;
};

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
};

export type Blueprint<C = Record<string, unknown>> = {
  key: string;
  version: number;
  name: string;
  description: string;
  /** Tipo de DomainEvent que lo dispara. */
  trigger: string;
  requiredModules: PlatformModule[];
  status: "active" | "deprecated";
  configSchema: ZodType<C, ZodTypeDef, unknown>;
  defaultConfig: C;
  /** Función pura: decide, a partir del evento y el contexto, si actuar y con qué. */
  decide: (event: StoredDomainEvent, ctx: BlueprintContext, config: C) => BlueprintDecision;
  /** Cómo se contacta (canal, enfriamiento, horario) según la configuración. */
  contactRules: (config: C) => ContactRules;
};

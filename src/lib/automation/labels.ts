// Etiquetas en español de los estados y razones de las ejecuciones (una sola copia para el portal y el Admin).

export type BadgeVariant = "success" | "secondary" | "destructive" | "warning" | "info";

export const EXECUTION_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
  SUCCEEDED: { label: "Hecha", variant: "success" },
  DISPATCHED: { label: "Enviada", variant: "info" },
  PENDING: { label: "En cola", variant: "info" },
  DRY_RUN: { label: "Simulada", variant: "secondary" },
  SKIPPED: { label: "Omitida", variant: "secondary" },
  FAILED: { label: "Falló", variant: "destructive" },
};

export const SKIP_REASON: Record<string, string> = {
  no_consent: "el cliente no dio su consentimiento",
  quiet_hours: "horario de silencio",
  cooldown: "ya se le contactó hace poco",
  do_not_contact: "el cliente pidió no ser contactado",
  no_phone: "sin teléfono",
  not_low: "el insumo no está bajo",
  below_min_level: "no llega al nivel configurado",
  module_disabled: "módulo apagado",
  invalid_config: "configuración inválida",
  blueprint_unavailable: "automatización no disponible",
  no_customer: "sin cliente",
  already_returned: "el cliente ya regresó",
  no_report: "sin datos del reporte",
  expired: "pasó el plazo de envío",
  control_group: "grupo de control (a propósito no se le escribió, para medir el efecto)",
  provider_skipped: "el proveedor la omitió",
  unsupported_action: "acción no soportada",
};

/** Resumen en una línea de lo que hizo una ejecución (a partir de su acción). */
export function describeAction(action: unknown, formatMoney: (n: number) => string): string | null {
  const a = (action ?? {}) as { recipients?: { channel: string }[]; type?: string; title?: string; body?: string; templateKey?: string; recipient?: { name?: string | null }; report?: { today?: { gross?: number; tickets?: number }; vsPreviousDayPct?: number | null } };
  const via = (a.recipients ?? []).length ? ` · por ${[...new Set((a.recipients ?? []).map((r) => (r.channel === "whatsapp" ? "WhatsApp" : "correo")))].join(" y ")} (${a.recipients!.length})` : "";
  if (a.type === "report") {
    const t = a.report?.today;
    return `${a.title ?? "Reporte"} — ventas ${formatMoney(t?.gross ?? 0)}, ${t?.tickets ?? 0} tickets${a.report?.vsPreviousDayPct != null ? `, ${a.report.vsPreviousDayPct > 0 ? "+" : ""}${a.report.vsPreviousDayPct}% vs. ayer` : ""}${via}`;
  }
  if (a.type === "alert") return `${a.title ?? ""}${a.body ? ` — ${a.body}` : ""}${via}`;
  if (a.type === "message") return `Mensaje a ${a.recipient?.name ?? "un cliente"}${a.templateKey ? ` (${a.templateKey})` : ""}`;
  return null;
}

// Canales del inbox unificado. El canal es un texto libre en `Conversation.channel` (lo manda el conector de
// cada plataforma desde n8n); aquí se normalizan los nombres y se agrupan en las pestañas del inbox.

export const INBOX_CHANNELS = ["whatsapp", "instagram", "messenger", "webchat", "email", "enquiry"] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

/** Pestañas del inbox: cada una agrupa uno o más canales ("Email y consultas" junta correo y formularios). */
export const INBOX_TABS = [
  { key: "all", channels: null },
  { key: "whatsapp", channels: ["whatsapp"] },
  { key: "instagram", channels: ["instagram"] },
  { key: "messenger", channels: ["messenger"] },
  { key: "webchat", channels: ["webchat"] },
  { key: "email", channels: ["email", "enquiry"] },
] as const;
export type InboxTabKey = (typeof INBOX_TABS)[number]["key"];

const ALIASES: Record<string, InboxChannel> = {
  whatsapp: "whatsapp",
  wa: "whatsapp",
  "whatsapp business": "whatsapp",
  instagram: "instagram",
  ig: "instagram",
  insta: "instagram",
  messenger: "messenger",
  facebook: "messenger",
  fb: "messenger",
  "facebook messenger": "messenger",
  webchat: "webchat",
  web: "webchat",
  website: "webchat",
  "website chat": "webchat",
  "website_chat": "webchat",
  chat: "webchat",
  email: "email",
  mail: "email",
  correo: "email",
  enquiry: "enquiry",
  enquiries: "enquiry",
  inquiry: "enquiry",
  form: "enquiry",
  "contact form": "enquiry",
  contact_form: "enquiry",
  formulario: "enquiry",
};

/** Nombre canónico de un canal; uno desconocido se conserva en minúsculas (aparece solo en "Todos"). */
export function normalizeChannel(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return "whatsapp";
  return ALIASES[value] ?? value;
}

export function parseInboxTab(raw: unknown): InboxTabKey {
  return INBOX_TABS.some((t) => t.key === raw) ? (raw as InboxTabKey) : "all";
}

/** Canales que cubre una pestaña (null = todos). */
export function channelsOfTab(tab: InboxTabKey): readonly string[] | null {
  return INBOX_TABS.find((t) => t.key === tab)?.channels ?? null;
}

/** Pestaña a la que pertenece un canal (los desconocidos solo se ven en "Todos"). */
export function tabOfChannel(channel: string): InboxTabKey {
  return INBOX_TABS.find((t) => t.channels?.some((c) => c === channel))?.key ?? "all";
}

/** Canales de los que sale un mensaje por el flujo "-outbound" de n8n (WhatsApp conserva su nombre histórico). */
export function outboundWorkflowPath(channel: string): string {
  const safe = channel.replace(/[^a-z0-9_-]/g, "") || "whatsapp";
  return safe === "whatsapp" ? "whatsapp-outbound" : `${safe}-outbound`;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Vista previa de un mensaje para la lista: una línea, sin saltos y con tope de largo. */
export function messagePreview(content: string, max = 140): string {
  return content.replace(/\s+/g, " ").trim().slice(0, max);
}

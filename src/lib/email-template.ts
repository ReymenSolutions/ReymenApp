// Plantilla de correo con la marca de Reymen. HTML de tablas con estilos en línea (lo que aguantan los clientes de correo),
// con versión de texto plano. Todo texto que llega de fuera (nombre, mensaje…) se escapa aquí: nunca se arma HTML a mano con él.

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type EmailRow = { label: string; value: string; href?: string };
export type EmailAction = { label: string; url: string; secondary?: boolean };

export interface BrandedEmail {
  /** Texto de vista previa en la bandeja (no se ve dentro del correo). */
  preheader?: string;
  title: string;
  intro?: string;
  rows?: EmailRow[];
  /** Texto largo (por ejemplo el mensaje del visitante); conserva los saltos de línea. */
  note?: { label: string; text: string };
  actions?: EmailAction[];
  footer?: string;
}

const C = { bg: "#0b1220", card: "#ffffff", ink: "#0f172a", muted: "#64748b", line: "#e2e8f0", brand: "#3b82f6", green: "#10b981", soft: "#f1f5f9" };

/** Solo enlaces http(s), mailto y tel; cualquier otro esquema se descarta. */
function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  return /^(https?:|mailto:|tel:)/i.test(href) ? href : null;
}

export function renderBrandedEmail(m: BrandedEmail): { html: string; text: string } {
  const rows = (m.rows ?? []).filter((r) => r.value);
  const rowsHtml = rows
    .map((r) => {
      const href = safeHref(r.href);
      const val = href ? `<a href="${escapeHtml(href)}" style="color:${C.brand};text-decoration:none;font-weight:600">${escapeHtml(r.value)}</a>` : `<span style="color:${C.ink};font-weight:600">${escapeHtml(r.value)}</span>`;
      return `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.muted};font-size:13px;width:34%;vertical-align:top">${escapeHtml(r.label)}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:15px;vertical-align:top">${val}</td></tr>`;
    })
    .join("");
  const noteHtml = m.note?.text
    ? `<div style="margin-top:20px"><div style="color:${C.muted};font-size:13px;margin-bottom:6px">${escapeHtml(m.note.label)}</div><div style="background:${C.soft};border-left:3px solid ${C.green};border-radius:8px;padding:12px 14px;color:${C.ink};font-size:15px;line-height:1.55">${escapeHtml(m.note.text).replace(/\n/g, "<br>")}</div></div>`
    : "";
  const actions = (m.actions ?? []).filter((a) => safeHref(a.url));
  const actionsHtml = actions.length
    ? `<div style="margin-top:26px">${actions
        .map((a) =>
          a.secondary
            ? `<a href="${escapeHtml(a.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 20px;border:1px solid ${C.line};border-radius:10px;color:${C.ink};font-weight:700;font-size:14px;text-decoration:none">${escapeHtml(a.label)}</a>`
            : `<a href="${escapeHtml(a.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;background:${C.brand};border-radius:10px;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none">${escapeHtml(a.label)}</a>`
        )
        .join("")}</div>`
    : "";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(m.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
${m.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(m.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 16px 4px;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.02em">Reymen<span style="color:${C.brand}">.</span> <span style="font-size:12px;font-weight:600;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase">Solutions</span></td></tr>
    <tr><td style="background:${C.card};border-radius:16px;padding:28px 26px;border-top:4px solid ${C.brand}">
      <h1 style="margin:0 0 6px 0;font-size:22px;line-height:1.25;color:${C.ink};letter-spacing:-.01em">${escapeHtml(m.title)}</h1>
      ${m.intro ? `<p style="margin:0 0 18px 0;color:${C.muted};font-size:15px;line-height:1.55">${escapeHtml(m.intro)}</p>` : ""}
      ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>` : ""}
      ${noteHtml}
      ${actionsHtml}
    </td></tr>
    <tr><td style="padding:16px 8px 0 8px;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center">${escapeHtml(m.footer ?? "Aviso automático de Reymen Solutions.")}</td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    m.title,
    m.intro ?? "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    m.note?.text ? `\n${m.note.label}:\n${m.note.text}` : "",
    ...actions.map((a) => `${a.label}: ${a.url}`),
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}

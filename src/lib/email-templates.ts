/**
 * Escapes a string for safe interpolation into HTML markup. Every value in
 * this file that can originate from user-controlled input (org names,
 * contact names, request titles, automation names) must be passed through
 * this before being embedded in an `html` template — otherwise a malicious
 * name/title becomes stored HTML injected straight into an admin's inbox
 * (phishing links disguised as our own CTAs, tracking pixels, etc.).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const brandHeader = `
  <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto;">
    <p style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 24px;">
      Reymen <span style="color: #1a3ef5;">Solutions</span>
    </p>
`;
const brandFooter = `
    <p style="font-size: 12px; color: #94a3b8; margin-top: 32px;">
      Si no esperabas este correo, puedes ignorarlo con seguridad.
    </p>
  </div>
`;

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#1a3ef5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>`;
}

export function passwordResetEmail(resetUrl: string, expiresInMinutes: number) {
  return {
    subject: "Restablece tu contraseña — Reymen Solutions",
    html: `${brandHeader}
      <h1 style="font-size:20px;color:#0f172a;">Restablece tu contraseña</h1>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        Recibimos una solicitud para restablecer tu contraseña. Este enlace es válido por ${expiresInMinutes} minutos.
      </p>
      <p style="margin: 24px 0;">${button(resetUrl, "Restablecer contraseña")}</p>
      <p style="font-size:12px;color:#94a3b8;word-break:break-all;">${escapeHtml(resetUrl)}</p>
      ${brandFooter}`,
    text: `Restablece tu contraseña visitando: ${resetUrl} (válido por ${expiresInMinutes} minutos)`,
  };
}

export function teamInviteEmail(orgName: string, loginUrl: string) {
  const safeOrgName = escapeHtml(orgName);
  return {
    subject: `Te agregaron al equipo de ${orgName} en Reymen`,
    html: `${brandHeader}
      <h1 style="font-size:20px;color:#0f172a;">Bienvenido a ${safeOrgName}</h1>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        Un administrador te agregó al equipo en Reymen Solutions. Usa tu email y la contraseña temporal que te compartieron para iniciar sesión.
      </p>
      <p style="margin: 24px 0;">${button(loginUrl, "Iniciar sesión")}</p>
      ${brandFooter}`,
    text: `Te agregaron al equipo de ${orgName} en Reymen Solutions. Inicia sesión en: ${loginUrl}`,
  };
}

export function escalationAlertEmail(orgName: string, contactName: string, portalUrl: string) {
  const safeOrgName = escapeHtml(orgName);
  const safeContactName = escapeHtml(contactName);
  return {
    subject: `⚠️ Conversación escalada — ${orgName}`,
    html: `${brandHeader}
      <h1 style="font-size:20px;color:#0f172a;">Conversación escalada a humano</h1>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        ${safeContactName} necesita atención de tu equipo en <strong>${safeOrgName}</strong>.
      </p>
      <p style="margin: 24px 0;">${button(portalUrl, "Ver conversación")}</p>
      ${brandFooter}`,
    text: `${contactName} necesita atención en ${orgName}. Ver: ${portalUrl}`,
  };
}

export function automationFailureEmail(orgName: string, automationName: string, portalUrl: string) {
  const safeOrgName = escapeHtml(orgName);
  const safeAutomationName = escapeHtml(automationName);
  return {
    subject: `🔴 Automatización con errores — ${automationName}`,
    html: `${brandHeader}
      <h1 style="font-size:20px;color:#0f172a;">Automatización con errores</h1>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        La automatización <strong>${safeAutomationName}</strong> de <strong>${safeOrgName}</strong> reportó una falla y requiere revisión.
      </p>
      <p style="margin: 24px 0;">${button(portalUrl, "Ver automatización")}</p>
      ${brandFooter}`,
    text: `${automationName} (${orgName}) reportó una falla. Ver: ${portalUrl}`,
  };
}

export function newClientRequestEmail(orgName: string, requestTitle: string, portalUrl: string) {
  const safeOrgName = escapeHtml(orgName);
  const safeRequestTitle = escapeHtml(requestTitle);
  return {
    subject: `📩 Nueva solicitud de ${orgName}`,
    html: `${brandHeader}
      <h1 style="font-size:20px;color:#0f172a;">Nueva solicitud de cliente</h1>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        <strong>${safeOrgName}</strong> envió una nueva solicitud: <strong>${safeRequestTitle}</strong>.
      </p>
      <p style="margin: 24px 0;">${button(portalUrl, "Ver solicitud")}</p>
      ${brandFooter}`,
    text: `${orgName} envió una nueva solicitud: ${requestTitle}. Ver: ${portalUrl}`,
  };
}

const money = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n}%`);

/** Reporte ejecutivo diario (ya calculado por Reymen; aquí solo se da formato). */
export function dailyReportEmail(
  orgName: string,
  r: {
    date: string;
    today: { gross: number; net: number; tickets: number; avgTicket: number; cancellations: number; cancelledAmount: number };
    vsPreviousDayPct: number | null;
    vsLastWeekPct: number | null;
    topProducts: { name: string; quantity: number }[];
    criticalStock: { name: string; unit: string; currentStock: number; minStock: number }[];
    lowStockCount: number;
    waste: { name: string; unit: string; quantity: number }[];
  },
  portalUrl: string,
) {
  const li = (items: string[]) => (items.length ? `<ul style="font-size:14px;color:#475569;line-height:1.7;padding-left:18px;">${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<p style="font-size:14px;color:#94a3b8;">Sin datos.</p>`);
  return {
    subject: `Reporte del ${r.date} — ${orgName}`,
    html: `${brandHeader}
      <h1 style="font-size:20px;color:#0f172a;">Reporte del ${escapeHtml(r.date)}</h1>
      <p style="font-size:14px;color:#475569;">${escapeHtml(orgName)}</p>
      <p style="font-size:14px;color:#0f172a;line-height:1.7;">
        <strong>Ventas:</strong> ${money(r.today.gross)} (${r.today.tickets} tickets, ticket promedio ${money(r.today.avgTicket)})<br/>
        <strong>Contra el día anterior:</strong> ${pct(r.vsPreviousDayPct)} · <strong>contra el mismo día de la semana pasada:</strong> ${pct(r.vsLastWeekPct)}<br/>
        <strong>Cancelaciones:</strong> ${r.today.cancellations} (${money(r.today.cancelledAmount)})
      </p>
      <h2 style="font-size:15px;color:#0f172a;">Lo más vendido</h2>
      ${li(r.topProducts.map((p) => `${escapeHtml(p.name)} — ${p.quantity}`))}
      <h2 style="font-size:15px;color:#0f172a;">Stock crítico${r.lowStockCount ? ` (${r.lowStockCount} insumos bajo su mínimo)` : ""}</h2>
      ${li(r.criticalStock.map((i) => `${escapeHtml(i.name)}: ${i.currentStock} ${escapeHtml(i.unit)} (mínimo ${i.minStock})`))}
      <h2 style="font-size:15px;color:#0f172a;">Merma</h2>
      ${li(r.waste.map((w) => `${escapeHtml(w.name)}: ${w.quantity} ${escapeHtml(w.unit)}`))}
      <p style="margin-top:24px;">${button(portalUrl, "Abrir Reymen")}</p>
    ${brandFooter}`,
  };
}

/** Aviso interno de una calificación baja de un cliente (para dar seguimiento). */
export function feedbackAlertEmail(orgName: string, f: { score: number; comment: string | null; customerName: string | null; customerPhone: string | null }, portalUrl: string) {
  return {
    subject: `Un cliente calificó ${f.score}/5 — ${orgName}`,
    html: `${brandHeader}
      <h1 style="font-size:20px;color:#0f172a;">Un cliente calificó ${f.score} de 5</h1>
      <p style="font-size:14px;color:#475569;line-height:1.6;">
        <strong>Cliente:</strong> ${escapeHtml(f.customerName ?? "Sin nombre")}${f.customerPhone ? ` (${escapeHtml(f.customerPhone)})` : ""}<br/>
        <strong>Comentario:</strong> ${f.comment ? escapeHtml(f.comment) : "—"}
      </p>
      <p style="font-size:14px;color:#475569;">Conviene contactarlo pronto y marcar el seguimiento como resuelto en Reymen.</p>
      <p style="margin-top:24px;">${button(portalUrl, "Abrir Reymen")}</p>
    ${brandFooter}`,
  };
}

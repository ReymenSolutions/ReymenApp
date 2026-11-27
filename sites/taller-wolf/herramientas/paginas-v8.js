// Genera las páginas de la v8 (una por sección) con encabezado y pie compartidos,
// y el diccionario en inglés (assets/i18n-en.js) a partir de los mismos textos.
// Uso: node herramientas/paginas-v8.js v8
const fs = require("fs");
const path = require("path");
const out = process.argv[2];
if (!out) { console.error("Falta la carpeta de salida"); process.exit(1); }
const vehicleCatalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../src/lib/workshop/vehicle-catalog.json"), "utf8"));

/* ---------- Textos: cada uno se escribe una vez en español y en inglés ---------- */
const EN = {};
const tr = (key, es, en) => { EN[key] = en; return es; };
const tag = (t, key, es, en, attrs = "") => `<${t} data-i18n="${key}"${attrs ? " " + attrs : ""}>${tr(key, es, en)}</${t}>`;
const ph = (key, es, en) => `placeholder="${tr(key, es, en)}" data-i18n-ph="${key}"`;
const aria = (key, es, en) => `aria-label="${tr(key, es, en)}" data-i18n-aria="${key}"`;

/* ---------- Contorno real de los ojos del lobo (en píxeles del logo, 800×825) ---------- */
const EYE_L = "M354.5 286.0L355.0 285.4L356.0 285.6L356.6 286.0L357.0 286.4L358.0 286.9L359.0 287.6L360.0 288.2L361.0 288.7L362.0 289.3L363.0 289.9L364.0 290.5L365.0 291.2L366.0 291.7L367.0 292.4L368.0 293.1L369.0 293.6L370.0 294.3L371.0 294.7L372.0 295.4L373.0 295.9L374.0 296.5L375.0 297.2L375.8 298.0L375.6 299.0L375.0 299.5L374.0 300.1L373.0 300.5L372.0 300.7L371.0 300.8L370.0 300.9L369.0 301.0L368.0 301.1L367.0 300.9L366.0 300.7L365.0 300.5L364.0 300.2L363.0 299.7L362.0 299.2L361.0 298.5L360.0 297.6L359.0 296.7L358.5 296.0L358.0 295.4L357.1 294.0L356.6 293.0L356.2 292.0L355.7 291.0L355.4 290.0L355.1 289.0L354.8 288.0L354.6 287.0Z";
const EYE_R = "M468.8 287.0L469.0 286.9L470.0 287.0L470.4 288.0L470.4 289.0L470.2 290.0L469.7 291.0L469.2 292.0L468.6 293.0L468.0 294.0L467.2 295.0L466.2 296.0L465.1 297.0L464.0 297.8L463.0 298.6L462.0 299.3L461.0 299.8L460.0 300.4L459.0 300.7L458.0 301.1L457.0 301.3L456.0 301.4L455.0 301.4L454.0 301.4L453.0 301.3L452.0 301.1L451.0 300.7L450.0 300.4L449.0 299.8L448.0 299.3L447.7 299.0L447.3 298.0L448.0 297.4L449.0 296.8L450.0 296.3L451.0 295.8L452.0 295.5L453.0 295.2L454.0 294.7L455.0 294.4L456.0 293.8L457.0 293.4L458.0 292.7L459.0 292.2L460.0 291.5L461.0 291.0L462.0 290.4L463.0 289.8L464.0 289.2L465.0 288.6L466.0 288.1L467.0 287.6L468.0 287.3Z";

/* ---------- Ojos encendidos (estilo "ojos rojos en la oscuridad") ----------
   La silueta es la del ojo del logo. Al pasar el mouse se llena de un rojo claro
   con el centro casi blanco y un resplandor rojo alrededor. */
const EYES = {
  // cx/cy: centro del ojo; tilt: inclinación (grados). Todo en píxeles del logo.
  l: { d: EYE_L, cx: 365.2, cy: 294.6, tilt: 29.4 },
  r: { d: EYE_R, cx: 458.6, cy: 296.0, tilt: -23.4 }
};
function eyeArt(side) {
  const e = EYES[side];
  return `<path class="eye-edge" d="${e.d}" fill="none" stroke-width="3.4" stroke-linejoin="round"/>
            <g class="eye">
              <path class="eye-bloom wide" d="${e.d}" filter="url(#wf-bloom-wide)"/>
              <path class="eye-bloom" d="${e.d}" filter="url(#wf-bloom)"/>
              <path class="eye-core" d="${e.d}" fill="url(#wf-core-${side})"/>
              <path class="eye-hot" d="${e.d}" fill="url(#wf-hot-${side})" filter="url(#wf-soft)"/>
              <path class="rim" data-eye="${side}" d="${e.d}" fill="none" stroke="none"/>
            </g>`;
}
const EYE_ART = { l: eyeArt("l"), r: eyeArt("r") };
// Degradados elípticos alineados con la inclinación de cada ojo
const eyeGrad = (side) => {
  const e = EYES[side], tf = `translate(${e.cx} ${e.cy}) rotate(${e.tilt}) scale(1 .42) translate(${-e.cx} ${-e.cy})`;
  return `<radialGradient id="wf-core-${side}" gradientUnits="userSpaceOnUse" cx="${e.cx}" cy="${e.cy}" r="13" gradientTransform="${tf}"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#ffd6d9"/><stop offset=".78" stop-color="#ff5a62"/><stop offset="1" stop-color="#ff2a33"/></radialGradient>
      <radialGradient id="wf-hot-${side}" gradientUnits="userSpaceOnUse" cx="${e.cx}" cy="${e.cy}" r="9" gradientTransform="${tf}"><stop offset="0" stop-color="#fff6f6" stop-opacity=".95"/><stop offset=".45" stop-color="#ffd0d3" stop-opacity=".55"/><stop offset="1" stop-color="#ff9aa1" stop-opacity="0"/></radialGradient>`;
};

const wolf = (extra = "") => `<span class="wolf" data-wolf${extra}><span class="wolf-inner">
          <span class="wolf-crop"><img src="taller-wolf-logo-limpio.png" alt="" width="800" height="825"></span>
          <svg class="wolf-fx" viewBox="195 55 430 530" aria-hidden="true" focusable="false"><g class="wolf-glow">
            ${EYE_ART.l}
            ${EYE_ART.r}
          </g></svg>
          <span class="wolf-smoke"></span>
        </span></span>`;

/* ---------- Íconos y efectos compartidos ---------- */
const SPRITE = `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      ${eyeGrad("l")}
      ${eyeGrad("r")}
      <filter id="wf-bloom" x="-120%" y="-200%" width="340%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>
      <filter id="wf-bloom-wide" x="-250%" y="-400%" width="600%" height="900%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="wf-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7"/></filter>
    </defs>
    <symbol id="i-wa" viewBox="0 0 24 24"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.910 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/></symbol>
    <symbol id="i-phone" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></symbol>
    <symbol id="i-sun" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></g></symbol>
    <symbol id="i-moon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-6-6 6 6-6 6"/></symbol>
    <symbol id="i-left" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6"/></symbol>
    <symbol id="i-chat" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 12a8 8 0 0 1-11.6 7.14L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z"/><circle cx="8.5" cy="12" r="1.1" fill="currentColor"/><circle cx="12.5" cy="12" r="1.1" fill="currentColor"/><circle cx="16.5" cy="12" r="1.1" fill="currentColor"/></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h13m-5-6 6 6-6 6"/></symbol>
    <symbol id="i-up" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m-6 6 6-6 6 6"/></symbol>
    <symbol id="i-menu" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M18 6 6 18M6 6l12 12"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  </svg>`;

/* ---------- Páginas del sitio (para el menú) ---------- */
const NAV = [
  ["servicios.html", "nav.services", "Servicios", "Services"],
  ["garantia.html", "nav.warranty", "Garantía", "Warranty"],
  ["proceso.html", "nav.process", "Proceso", "Process"],
  ["cotizar.html", "nav.quote", "Cotizar", "Get a quote"],
  ["ubicacion.html", "nav.location", "Ubicación", "Location"]
];
const navLinks = (file) => NAV.map(([href, key, es, en]) =>
  `<a href="${href}"${href === file ? ' class="active" aria-current="page"' : ""} data-i18n="${key}">${tr(key, es, en)}</a>`).join("\n        ");

const CSP = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; frame-src https://www.google.com https://maps.google.com; connect-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'`;

const WA_ICON = `<svg aria-hidden="true"><use href="#i-wa"/></svg>`;

function header(file) {
  return `<header class="header" id="header">
    <div class="container">
      <a class="brand" href="index.html" ${aria("a.home", "Wolf Servicio Automotriz, ir al inicio", "Wolf Auto Service, go to home")}>
        ${wolf()}
        <span class="brand-word"><b>WOLF</b><small>SERVICIO AUTOMOTRIZ</small></span>
      </a>
      <nav class="nav" ${aria("a.nav", "Secciones", "Sections")}>
        ${navLinks(file)}
      </nav>
      <div class="header-tools">
        <a class="icon-btn hide-sm" href="tel:+528711079931" ${aria("a.call", "Llamar al 871 107 9931", "Call 871 107 9931")}><svg aria-hidden="true"><use href="#i-phone"/></svg></a>
        <button class="pill-toggle theme-toggle sheen" type="button" role="switch" aria-checked="false" aria-label="Cambiar a modo oscuro" data-theme-toggle>
          <span class="knob"></span>
          <span class="ico"><svg aria-hidden="true"><use href="#i-sun"/></svg></span>
          <span class="ico"><svg aria-hidden="true"><use href="#i-moon"/></svg></span>
        </button>
        <button class="pill-toggle lang-toggle sheen" type="button" aria-label="Cambiar idioma a inglés" data-lang-toggle>
          <span class="knob"></span>
          <span class="ico opt-es">ES</span>
          <span class="ico opt-en">EN</span>
        </button>
        <button class="icon-btn menu-btn" type="button" ${aria("a.menu", "Abrir menú", "Open menu")} aria-expanded="false" aria-controls="sheet" id="menu-btn"><svg aria-hidden="true"><use href="#i-menu"/></svg></button>
      </div>
    </div>
  </header>
  <nav class="sheet" id="sheet" ${aria("a.menuNav", "Menú", "Menu")}>
    ${NAV.map(([href, key, es]) => `<a href="${href}"${href === file ? ' aria-current="page"' : ""} data-i18n="${key}">${es}</a>`).join("\n    ")}
    <a href="tel:+528711079931" data-i18n="sheet.call">${tr("sheet.call", "Llamar 871 107 9931", "Call 871 107 9931")}</a>
  </nav>`;
}

function footer() {
  return `<footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="index.html" ${aria("a.home", "Wolf Servicio Automotriz, ir al inicio", "Wolf Auto Service, go to home")}>
            ${wolf()}
            <span class="brand-word"><b>WOLF</b><small>SERVICIO AUTOMOTRIZ</small></span>
          </a>
          ${tag("p", "f.tag", "Mecánica que te respalda. Servicio automotriz en Monterrey, N.L.", "Mechanics that back you up. Auto service in Monterrey, N.L.", 'class="f-tag"')}
        </div>
        <div>
          ${tag("h4", "f.site", "Sitio", "Site")}
          <ul>${NAV.map(([href, key, es]) => `<li><a href="${href}" data-i18n="${key}">${es}</a></li>`).join("")}</ul>
        </div>
        <div>
          ${tag("h4", "f.contact", "Contacto", "Contact")}
          <ul>
            <li><a href="tel:+528711079931">871 107 9931</a></li>
            <li>Burocratas 515, Monterrey, N.L.</li>
            ${tag("li", "f.h1", "Lunes a viernes, 9:00 am a 7:00 pm", "Monday to Friday, 9:00 am to 7:00 pm")}
            ${tag("li", "f.h2", "Sábado, 9:00 am a 3:00 pm", "Saturday, 9:00 am to 3:00 pm")}
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© <span data-year>2026</span> Taller Wolf. <span data-i18n="f.rights">${tr("f.rights", "Todos los derechos reservados.", "All rights reserved.")}</span></span>
        <nav ${aria("a.legal", "Legal", "Legal")}>
          <a href="privacidad.html" data-i18n="l.privacy">${tr("l.privacy", "Aviso de privacidad", "Privacy notice")}</a>
          <a href="terminos.html" data-i18n="l.terms">${tr("l.terms", "Términos y condiciones", "Terms and conditions")}</a>
          <a href="cookies.html" data-i18n="l.cookies">${tr("l.cookies", "Cookies", "Cookies")}</a>
        </nav>
      </div>
    </div>
  </footer>`;
}

function tail({ waFloat, vehicleCatalogEnabled }) {
  return `${waFloat ? `<a class="wa-float js-wa" id="wa-float" href="https://wa.me/528711079931" data-msg="Hola Taller Wolf, quiero pedir una cotización." target="_blank" rel="noopener noreferrer" ${aria("a.waFloat", "Escríbenos por WhatsApp", "Message us on WhatsApp")}>${WA_ICON}</a>` : ""}
  <div class="chat" id="chat">
    <section class="chat-panel" id="chat-panel" role="dialog" aria-labelledby="chat-title" hidden>
      <header class="chat-head">
        <span class="chat-avatar" aria-hidden="true"><img src="taller-wolf-logo-limpio.png" alt=""></span>
        <span class="chat-who">
          ${tag("strong", "ch.title", "Asistente Wolf", "Wolf Assistant", 'id="chat-title"')}
          <span class="chat-status"><i></i>${tag("span", "ch.status", "En línea", "Online")}</span>
        </span>
        <button class="chat-close" id="chat-close" type="button" ${aria("ch.close", "Cerrar chat", "Close chat")}><svg aria-hidden="true"><use href="#i-x"/></svg></button>
      </header>
      <div class="chat-log" id="chat-log" aria-live="polite">
        ${tag("p", "ch.hello", "¡Hola! Soy el asistente de Taller Wolf. ¿En qué te puedo ayudar hoy?", "Hi! I’m the Taller Wolf assistant. How can I help you today?", 'class="msg bot"')}
      </div>
      <div class="chat-quick" id="chat-quick">
        ${tag("button", "ch.q1", "Quiero una cotización", "I’d like a quote", 'type="button"')}
        ${tag("button", "ch.q2", "Horario y ubicación", "Hours and location", 'type="button"')}
        ${tag("button", "ch.q3", "Mi auto hace un ruido", "My car makes a noise", 'type="button"')}
      </div>
      <form class="chat-form" id="chat-form" autocomplete="off">
        <input id="chat-input" type="text" maxlength="500" placeholder="Escribe tu mensaje…" data-i18n-ph="ch.ph" ${aria("ch.input", "Mensaje", "Message")}>
        <button type="submit" ${aria("ch.send", "Enviar", "Send")}><svg aria-hidden="true"><use href="#i-send"/></svg></button>
      </form>
    </section>
    <button class="chat-fab" id="chat-fab" type="button" aria-expanded="false" aria-controls="chat-panel" ${aria("ch.open", "Abrir chat", "Open chat")}>
      <svg class="i-open" aria-hidden="true"><use href="#i-chat"/></svg><svg class="i-close" aria-hidden="true"><use href="#i-x"/></svg>
    </button>
  </div>
  <button class="to-top" id="to-top" type="button" ${aria("a.top", "Volver arriba", "Back to top")}>
    <svg class="ring" viewBox="0 0 46 46" aria-hidden="true"><circle class="bg" cx="23" cy="23" r="21"/><circle class="fg" cx="23" cy="23" r="21"/></svg>
    <svg class="arrow" aria-hidden="true"><use href="#i-up"/></svg>
  </button>
  <div class="cookie" id="cookie" role="dialog" aria-labelledby="cookie-title" hidden>
    ${tag("h4", "c.title", "Tu privacidad", "Your privacy", 'id="cookie-title"')}
    ${tag("p", "c.text", 'Esta página solo guarda en tu navegador el tema y el idioma que elegiste. El mapa de Google se carga únicamente si lo permites. <a href="cookies.html">Más información</a>.', 'This site only stores your chosen theme and language in your browser. The Google map only loads if you allow it. <a href="cookies.html">Learn more</a>.')}
    <div class="cookie-actions">
      ${tag("button", "c.essential", "Solo lo necesario", "Essentials only", 'class="btn btn-ghost btn-sm" type="button" data-consent="essential"')}
      ${tag("button", "c.all", "Permitir mapa", "Allow map", 'class="btn btn-red btn-sm" type="button" data-consent="all"')}
    </div>
  </div>
  <div class="toasts" id="toasts" aria-live="polite"></div>
  <script src="assets/i18n-en.js"></script>
  ${vehicleCatalogEnabled ? '<script src="assets/vehicle-catalog.js"></script>' : ""}
  <script src="assets/app.js"></script>`;
}

function page({ file, titleKey, titleEs, titleEn, desc, bodyClass = "", main, waFloat = false, extraHead = "" }) {
  const html = `<!doctype html>
<html lang="es-MX" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title data-i18n="${titleKey}">${tr(titleKey, titleEs, titleEn)}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
  <link rel="icon" type="image/png" href="taller-wolf-logo-limpio.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap">
  <script src="assets/theme-init.js"></script>
  <link rel="stylesheet" href="assets/styles.css">${extraHead}
</head>
<body class="${bodyClass}">
  ${SPRITE}

  ${header(file)}

${main}

  ${footer()}

  ${tail({ waFloat, vehicleCatalogEnabled: file === "cotizar.html" })}
</body>
</html>
`;
  fs.writeFileSync(path.join(out, file), html.replace(/[ \t]+$/gm, ""));
}

const head = (key1, es1, en1, key2, es2, en2) => `<div class="section-head reveal">
          ${tag("h1", key1, es1, en1, 'class="display"')}
          ${key2 ? tag("p", key2, es2, en2) : ""}
        </div>`;

/* ================= Inicio ================= */
const OG = `
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_MX">
  <meta property="og:site_name" content="Taller Wolf">
  <meta property="og:title" content="Taller Wolf | Servicio Automotriz en Monterrey, N.L.">
  <meta property="og:description" content="Mecánica que te respalda. Garantía de 90 días o 5,000 km en mano de obra. Cotiza por WhatsApp al 871 107 9931.">
  <meta property="og:image" content="taller-wolf-logo-limpio.png">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"AutoRepair","name":"Taller Wolf","slogan":"Mecánica que te respalda","image":"taller-wolf-logo-limpio.png","telephone":"+528711079931","address":{"@type":"PostalAddress","streetAddress":"Burocratas 515, Colonia Burócratas del Estado","addressLocality":"Monterrey","addressRegion":"N.L.","postalCode":"64380","addressCountry":"MX"},"geo":{"@type":"GeoCoordinates","latitude":25.7094361,"longitude":-100.3697586},"openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":"09:00","closes":"19:00"},{"@type":"OpeningHoursSpecification","dayOfWeek":"Saturday","opens":"09:00","closes":"15:00"}]}</script>`;

function renderHome() { page({
  file: "index.html", titleKey: "t.home", titleEs: "Taller Wolf | Servicio Automotriz en Monterrey, N.L.", titleEn: "Taller Wolf | Auto Service in Monterrey, N.L.",
  desc: "Taller Wolf, servicio automotriz en Monterrey, N.L. Garantía de 90 días o 5,000 km en mano de obra. Cotiza por WhatsApp al 871 107 9931.",
  bodyClass: "is-home", extraHead: OG + `
  <link rel="modulepreload" href="assets/vendor/three.module.min.js">
  <script type="module" src="assets/car3d.js"></script>`,
  main: `  <main>
    <section class="hero">
      <div class="decor" aria-hidden="true"><span class="dots"></span><span class="dots-hi"></span><span class="grain"></span></div>
      <div class="container">
        <div class="hero-grid">
          <div class="hero-wolf">
            ${wolf(' data-autoplay role="img" aria-label="Lobo de Taller Wolf"').replace('class="wolf"', 'class="wolf wolf-hero"')}
          </div>
          <div class="hero-copy">
            <span class="status reveal" id="status"><span class="dot"></span><span id="status-text">&nbsp;</span></span>
            ${tag("h1", "h.title", 'Mecánica que te <span class="red">respalda.</span>', 'Mechanics that <span class="red">back you up.</span>', 'class="display reveal" style="--delay:.08s"')}
            ${tag("p", "h.sub", "Servicio automotriz en Monterrey con garantía de 90 días o 5,000 km en mano de obra.", "Auto service in Monterrey with a 90-day or 5,000 km warranty on labor.", 'class="hero-sub reveal" style="--delay:.16s"')}
            <div class="hero-service-links reveal" style="--delay:.2s">${[0, 2, 3, 7].map((i) => `<a href="servicios.html#servicio-${SERVICES[i][0]}" data-i18n="h.service.${i}">${tr(`h.service.${i}`, SERVICES[i][1], SERVICES[i][2])}</a>`).join("")}</div>
            <div class="hero-cta reveal" style="--delay:.24s">
              <a class="btn btn-wa sheen js-wa" href="https://wa.me/528711079931" data-msg="Hola Taller Wolf, quiero cotizar un servicio para mi vehículo." target="_blank" rel="noopener noreferrer">${WA_ICON}<span data-i18n="h.cta">${tr("h.cta", "Cotizar por WhatsApp", "Get a quote on WhatsApp")}</span></a>
              <a class="btn btn-red sheen" href="cotizar.html"><span data-i18n="h.quoteNow">${tr("h.quoteNow", "Cotizar Ahora", "Get a Quote Now")}</span></a>
            </div>
            <div class="hero-meta reveal" style="--delay:.32s">
              ${tag("span", "h.wk", "<strong>Lunes a viernes</strong> 9:00 am a 7:00 pm", "<strong>Monday to Friday</strong> 9:00 am to 7:00 pm")}
              ${tag("span", "h.sat", "<strong>Sábado</strong> 9:00 am a 3:00 pm", "<strong>Saturday</strong> 9:00 am to 3:00 pm")}
            </div>
          </div>
          <div class="hero-car" id="car3d" tabindex="0" role="group" ${aria("car.aria", "Auto deportivo clásico en 3D. Arrástralo a los lados para girarlo y toca los puntos blancos para abrir puertas, cofre y cajuela.", "3D classic sports car. Drag sideways to turn it and tap the white dots to open the doors, hood and trunk.")}>
            <div class="car-stage"></div>
            <div class="car-hotspots">
              ${[["doorL", "car.doorL", "Puerta del conductor", "Driver's door"], ["doorR", "car.doorR", "Puerta del copiloto", "Passenger door"], ["hood", "car.hood", "Cofre", "Hood"], ["trunk", "car.trunk", "Cajuela", "Trunk"]].map(([id, key, es, en]) =>
              `<button class="hotspot" type="button" data-part="${id}" aria-pressed="false" hidden><span class="hs-dot"></span><span class="hs-label" data-i18n="${key}">${tr(key, es, en)}</span></button>`).join("\n              ")}
            </div>
            <p class="car-hint"><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18"/></svg><span data-i18n="car.hint">${tr("car.hint", "Arrastra para girar", "Drag to turn")}</span></p>
            <p class="car-credit">${tr("car.credit", "Modelo 3D", "3D model")} <a href="https://skfb.ly/oJJKq" target="_blank" rel="noopener noreferrer">“Airtsel Valor Proiettile”</a> · Yudha Mfr · <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
          </div>
        </div>
      </div>
    </section>
    <section class="home-services" aria-labelledby="home-services-title">
      <div class="container">
        <div class="section-head">
          ${tag("h2", "h.servicesTitle", "Servicios para tu vehículo", "Services for your vehicle", 'id="home-services-title" class="display"')}
          ${tag("p", "h.servicesIntro", "Mantenimiento, diagnóstico y reparación. Cuéntanos qué necesita tu auto.", "Maintenance, diagnostics and repairs. Tell us what your car needs.")}
        </div>
        <div class="home-services-grid">${[0, 2, 3, 4, 5, 7].map((i) => `<a class="card home-service" href="servicios.html#servicio-${SERVICES[i][0]}"><span class="svc-img"><img src="assets/servicios/${SERVICES[i][0]}.webp" alt="" width="720" height="720" loading="lazy"></span><span class="svc-body"><strong class="svc-title" data-i18n="s.${i}.t">${tr(`s.${i}.t`, SERVICES[i][1], SERVICES[i][2])}</strong><span class="svc-short" data-i18n="s.${i}.s">${tr(`s.${i}.s`, SERVICES[i][3], SERVICES[i][4])}</span></span></a>`).join("")}</div>
        <a class="btn btn-ghost home-services-all" href="servicios.html" data-i18n="h.allServices">${tr("h.allServices", "Ver todos los servicios", "View all services")}</a>
      </div>
    </section>
  </main>`
}); }

tr("ch.ph", "Escribe tu mensaje…", "Type your message…");

/* ================= Servicios ================= */
const SERVICES = [
  ["afinacion-mayor", "Afinación mayor", "Major tune-up", "Recupera potencia y rendimiento de combustible.", "Restores power and fuel economy.", "Servicio completo de afinación para que tu motor recupere potencia, arranque bien y gaste menos combustible.", "A complete tune-up so your engine gets its power back, starts reliably and uses less fuel."],
  ["afinacion-menor", "Afinación menor", "Minor tune-up", "Mantenimiento preventivo entre afinaciones mayores.", "Preventive care between major tune-ups.", "Mantenimiento preventivo para mantener tu motor en buen estado entre una afinación mayor y otra.", "Preventive maintenance to keep your engine in good shape between major tune-ups."],
  ["aceite-filtros", "Cambio de aceite y filtros", "Oil and filter change", "Según las especificaciones de tu vehículo.", "Following your vehicle's specifications.", "Aceite y filtros de acuerdo con lo que pide el fabricante de tu vehículo.", "Oil and filters according to your vehicle manufacturer's requirements."],
  ["frenos", "Frenos", "Brakes", "Frena seguro y sin ruidos.", "Stop safely and quietly.", "Revisión y servicio del sistema de frenos para que frenes seguro y sin ruidos.", "Brake system inspection and service so you stop safely and quietly."],
  ["motor", "Reparación de motor", "Engine repair", "Diagnóstico y reparación a fondo del motor.", "In-depth engine diagnosis and repair.", "Diagnóstico y reparación del motor: fugas, ruidos, pérdida de potencia, sobrecalentamiento y ajuste o reparación general.", "Engine diagnosis and repair: leaks, noises, loss of power, overheating, and general repair or rebuild."],
  ["transmision", "Reparación de transmisión", "Transmission repair", "Cambios suaves, sin tirones ni patinaje.", "Smooth shifts, no jerks or slipping.", "Diagnóstico y reparación de transmisión automática y estándar: cambios bruscos, patinaje, fugas o ruidos.", "Automatic and manual transmission diagnosis and repair: harsh shifts, slipping, leaks or noises."],
  ["suspension", "Suspensión", "Suspension", "Manejo estable y cómodo.", "A stable, comfortable ride.", "Diagnóstico y reparación de la suspensión para un manejo estable y cómodo.", "Suspension diagnosis and repair for a stable, comfortable ride."],
  ["diagnostico", "Diagnóstico electrónico", "Electronic diagnostics", "Escaneo para fallas y testigos encendidos.", "Scans for faults and warning lights.", "Escaneo computarizado para encontrar la causa de fallas y testigos encendidos en el tablero.", "A computer scan to find the cause of faults and dashboard warning lights."],
  ["revision-20-puntos", "Revisión de 20 puntos", "20-point inspection", "Detecta a tiempo lo que necesita atención.", "Catch what needs attention early.", "Inspección general de tu vehículo para detectar a tiempo lo que necesita atención.", "A general inspection of your vehicle to catch what needs attention early."],
  ["bateria", "Cambio de batería", "Battery replacement", "Con revisión del sistema de carga.", "With a charging system check.", "Revisión del sistema de carga y cambio de batería cuando hace falta.", "Charging system check and battery replacement when needed."],
  ["rotacion-balanceo", "Rotación y balanceo", "Rotation and balancing", "Desgaste parejo y sin vibraciones.", "Even wear, no vibrations.", "Rotación y balanceo de llantas para un desgaste parejo y un manejo sin vibraciones.", "Tire rotation and balancing for even wear and a vibration-free ride."]
];
renderHome();
const cards = SERVICES.map(([id, tes, ten, ses, sen, des, den], i) => `<button class="card service reveal" id="servicio-${id}" type="button" data-wa="${tes}" data-img="assets/servicios/${id}.webp" style="--delay:${(i % 3) * 0.06 + Math.floor(i / 3) * 0.08}s">
            <span class="svc-img"><img src="assets/servicios/${id}.webp" alt="" width="720" height="720" loading="lazy"></span>
            <span class="svc-body">
              <span class="svc-title" data-i18n="s.${i}.t">${tr(`s.${i}.t`, tes, ten)}</span>
              <span class="svc-short" data-i18n="s.${i}.s">${tr(`s.${i}.s`, ses, sen)}</span>
            </span>
            <span class="svc-desc" hidden data-i18n="s.${i}.d">${tr(`s.${i}.d`, des, den)}</span>
          </button>`).join("\n          ");

page({
  file: "servicios.html", titleKey: "t.services", titleEs: "Servicios | Taller Wolf", titleEn: "Services | Taller Wolf",
  desc: "Servicios de Taller Wolf en Monterrey: afinación, aceite y filtros, frenos, reparación de motor y transmisión, suspensión, diagnóstico, batería, rotación y balanceo.",
  waFloat: true,
  main: `  <main class="page page-services">
      <div class="container">
        ${head("s.h", "Servicios", "Services", "s.p", "Toca un servicio para ver de qué se trata y cotizarlo directo por WhatsApp.", "Tap a service to see what it covers and get a quote on WhatsApp.")}
        <div class="services-grid">
          ${cards}
        </div>
      </div>
    </main>

  <dialog class="modal" id="service-modal" aria-labelledby="m-title">
    <div class="modal-img"><img id="m-img" src="" alt="" width="720" height="720"></div>
    <div class="modal-body">
      <button class="icon-btn modal-close" type="button" data-close ${aria("a.close", "Cerrar", "Close")}><svg aria-hidden="true"><use href="#i-x"/></svg></button>
      <h3 id="m-title">&nbsp;</h3>
      <p id="m-desc"></p>
      <a class="btn btn-wa sheen" id="m-cta" href="https://wa.me/528711079931" target="_blank" rel="noopener noreferrer">${WA_ICON}<span data-i18n="m.cta">${tr("m.cta", "Cotizar este servicio", "Get a quote for this service")}</span></a>
    </div>
  </dialog>`
});

/* ================= Garantía ================= */
const stat = (n, big, unitKey, ues, uen, k, h3es, h3en, pes, pen, delay) => `<div class="card stat reveal" style="--delay:${delay}s">
            <div class="big">${big}${unitKey ? `<span class="unit" data-i18n="${unitKey}">${tr(unitKey, ues, uen)}</span>` : ""}</div>
            ${tag("h3", `g.${k}.h`, h3es, h3en)}
            ${tag("p", `g.${k}.p`, pes, pen)}
          </div>`;
page({
  file: "garantia.html", titleKey: "t.warranty", titleEs: "Garantía | Taller Wolf", titleEn: "Warranty | Taller Wolf",
  desc: "Garantía de 90 días o 5,000 km en mano de obra. Nada se hace sin tu autorización.",
  waFloat: true,
  main: `  <main class="page">
      <div class="container">
        ${head("g.h", "Trabajo con respaldo", "Work you can count on", "g.p", "Sabes qué se hace, cuánto cuesta y qué garantía tiene antes de que empecemos.", "You know what will be done, what it costs and what warranty it has before we start.")}
        <div class="stats">
          ${stat(1, '<span data-count="90">90</span>', "g.u1", "días", "days", 1, "Garantía en mano de obra", "Labor warranty", "O 5,000 km, lo que ocurra primero.", "Or 5,000 km, whichever comes first.", 0)}
          ${stat(2, '<span data-count="5000">5,000</span>', "g.u2", "km", "km", 2, "De garantía recorrida", "Of warranty mileage", "O 90 días, lo que ocurra primero.", "Or 90 days, whichever comes first.", 0.08)}
          ${stat(3, "0", null, "", "", 3, "Trabajos sin tu autorización", "Jobs without your approval", "Nada adicional se hace sin que lo apruebes antes.", "Nothing extra is done unless you approve it first.", 0.16)}
          ${stat(4, "100", "g.u4", "%", "%", 4, "Piezas reemplazadas, tuyas", "Replaced parts, yours", "Te entregamos lo que se cambió. Las refacciones tienen la garantía de su fabricante.", "We hand back what was replaced. Parts carry their manufacturer's warranty.", 0.24)}
        </div>
      </div>
    </main>`
});

/* ================= Proceso ================= */
const step = (i, h3es, h3en, pes, pen) => `<li class="step"><span class="n">${i}</span><div class="step-text">${tag("h3", `p.${i}.h`, h3es, h3en)}${tag("p", `p.${i}.p`, pes, pen)}</div></li>`;
page({
  file: "proceso.html", titleKey: "t.process", titleEs: "Proceso | Taller Wolf", titleEn: "Process | Taller Wolf",
  desc: "Cómo funciona Taller Wolf: cotización, diagnóstico, aprobación por escrito y entrega con garantía.",
  waFloat: true,
  main: `  <main class="page">
      <div class="container">
        ${head("p.h", "Cómo funciona", "How it works", "p.p", "Cuatro pasos, sin sorpresas.", "Four steps, no surprises.")}
        <ol class="steps" id="steps">
          <li class="steps-line" aria-hidden="true"><span class="steps-track"></span><span class="steps-fill"></span></li>
          ${step(1, "Pides tu cotización", "You request a quote", "Por WhatsApp o con el formulario, con los datos de tu vehículo.", "On WhatsApp or with the form, with your vehicle's details.")}
          ${step(2, "Diagnóstico en taller", "In-shop diagnosis", "Revisamos tu vehículo en el taller.", "We inspect your vehicle at the shop.")}
          ${step(3, "Apruebas por escrito", "You approve in writing", "Tú apruebas la cotización por escrito antes de iniciar.", "You approve the quote in writing before we start.")}
          ${step(4, "Entrega con garantía", "Delivery with warranty", "Recibes tu vehículo con garantía.", "You get your vehicle back with a warranty.")}
        </ol>
      </div>
    </main>`
});

/* ================= Cotizar ================= */
const field = (id, name, lkey, les, len, attrs, full = false, phArgs = null) => `<div class="field${full ? " full" : ""}">${tag("label", lkey, les, len, `for="f-${id}"`)}<${name === "falla" ? "textarea" : "input"} id="f-${id}" name="${name}" ${attrs}${phArgs ? " " + ph(...phArgs) : ""}>${name === "falla" ? "</textarea>" : ""}<span class="error" id="e-${id}" role="alert"></span></div>`;
page({
  file: "cotizar.html", titleKey: "t.quote", titleEs: "Cotizar | Taller Wolf", titleEn: "Get a quote | Taller Wolf",
    desc: "Solicita una cotización para el servicio de tu vehículo con Taller Wolf.",
  main: `  <main class="page">
      <div class="container form-wrap">
         ${head("q.h", "Cotiza tu servicio", "Get a quote", "q.p", "Enviaremos tu solicitud a Taller Wolf para que te contacten sobre tu cotización. También puedes escribirles por WhatsApp.", "We will send your request to Taller Wolf so they can contact you about your quote. You can also message them on WhatsApp.")}
        <form class="card form reveal" id="quote-form" novalidate>
          <div class="fields">
            ${field("nombre", "nombre", "q.name", "Nombre", "Name", 'type="text" autocomplete="name" required maxlength="80"')}
            ${field("telefono", "telefono", "q.phone", "Teléfono / WhatsApp", "Phone / WhatsApp", 'type="tel" inputmode="tel" autocomplete="tel" required maxlength="20"', false, ["q.phonePh", "10 dígitos", "10 digits"])}
            <div class="field"><label for="f-marca" data-i18n="q.make">${tr("q.make", "Marca", "Make")}</label><div class="search-input vehicle-picker"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="f-marca" name="marca" type="text" required maxlength="40" ${ph("q.searchMake", "Busca o escribe la marca", "Search or type a make")} autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="vehicle-makes" aria-expanded="false"><button type="button" class="vehicle-picker-toggle" data-picker="marca" aria-label="Ver marcas / Show makes">⌄</button><div id="vehicle-makes" class="vehicle-picker-options" role="listbox" hidden></div></div><span class="error" id="e-marca" role="alert"></span></div>
            <div class="field"><label for="f-modelo" data-i18n="q.model">${tr("q.model", "Modelo", "Model")}</label><div class="search-input vehicle-picker"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="f-modelo" name="modelo" type="text" required maxlength="40" ${ph("q.searchModel", "Busca o escribe el modelo", "Search or type a model")} autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="vehicle-models" aria-expanded="false"><button type="button" class="vehicle-picker-toggle" data-picker="modelo" aria-label="Ver modelos / Show models">⌄</button><div id="vehicle-models" class="vehicle-picker-options" role="listbox" hidden></div></div><span class="error" id="e-modelo" role="alert"></span></div>
            ${field("anio", "anio", "q.year", "Año", "Year", 'type="text" inputmode="numeric" required maxlength="4" placeholder="2018"')}
            ${field("placas", "placas", "q.plates", "Placas (opcional)", "License plate (optional)", 'type="text" maxlength="12" autocapitalize="characters"')}
            ${field("km", "kilometraje", "q.km", "Kilometraje (opcional)", "Mileage (optional)", 'type="text" inputmode="numeric" maxlength="9" placeholder="85000"', true)}
            ${field("falla", "falla", "q.issue", "Servicio o falla que reporta", "Service needed or issue", 'required maxlength="600"', true, ["q.issuePh", "Afinación mayor, o: rechinan los frenos al frenar", "Major tune-up, or: the brakes squeak"])}
          </div>
          <div class="hp" aria-hidden="true"><label for="f-web">No llenar</label><input id="f-web" name="web" type="text" tabindex="-1" autocomplete="off"></div>
          <label class="consent"><input type="checkbox" id="f-consent" required>${tag("span", "q.consent", 'Leí y acepto el <a href="privacidad.html">aviso de privacidad</a> y los <a href="terminos.html">términos y condiciones</a>.', 'I have read and accept the <a href="privacidad.html">privacy notice</a> and the <a href="terminos.html">terms and conditions</a>.')}</label>
           <label class="consent"><input type="checkbox" id="f-maintenance-consent">${tag("span", "q.maintenance", "Acepto recibir recordatorios de mantenimiento de mi vehículo. Es opcional y podré dejar de recibirlos.", "I agree to receive vehicle maintenance reminders. This is optional and I can opt out.")}</label>
          <span class="error" id="e-consent" role="alert"></span>
          <div class="form-actions">
             ${tag("p", "q.note", "Tu solicitud se guardará en el sistema del taller. También puedes contactarlo directamente por WhatsApp.", "Your request will be saved in the shop's system. You can also contact them directly on WhatsApp.", 'class="form-note"')}
             <p id="quote-status" role="status" aria-live="polite" hidden></p>
             <button class="btn btn-wa sheen" type="submit"><span data-i18n="q.send">${tr("q.send", "Enviar solicitud", "Send request")}</span></button>
             <a class="btn btn-ghost" href="https://wa.me/528711079931" target="_blank" rel="noopener noreferrer">${WA_ICON}<span data-i18n="q.whatsapp">${tr("q.whatsapp", "Escribir por WhatsApp", "Message on WhatsApp")}</span></a>
          </div>
        </form>
        <section id="quote-success" class="card quote-success" role="status" aria-live="polite" hidden><div class="quote-success-icon" aria-hidden="true">✓</div><h2 tabindex="-1" data-i18n="q.successH">${tr("q.successH", "Solicitud enviada", "Request sent")}</h2><p data-i18n="q.successP">${tr("q.successP", "Recibimos los datos de tu vehículo y el servicio que necesitas. Taller Wolf se pondrá en contacto contigo.", "We received your vehicle and service details. Taller Wolf will contact you.")}</p><button type="button" id="quote-again" class="btn btn-red" data-i18n="q.again">${tr("q.again", "Cotizar de nuevo", "Request another quote")}</button></section>
      </div>
    </main>`
});

/* ================= Ubicación ================= */
page({
  file: "ubicacion.html", titleKey: "t.location", titleEs: "Ubicación | Taller Wolf", titleEn: "Location | Taller Wolf",
  desc: "Taller Wolf: Burocratas 515, Colonia Burócratas del Estado, 64380 Monterrey, N.L. Lunes a viernes 9 a 19 h, sábado 9 a 15 h.",
  waFloat: true,
  main: `  <main class="page">
      <div class="container">
        ${head("u.h", "Visítanos", "Visit us")}
        <div class="location">
          <div class="card info reveal">
            <div>${tag("span", "u.addr", "Dirección", "Address", 'class="k"')}<button class="v" type="button" id="copy-address" data-copy="Burocratas 515, Colonia Burócratas del Estado, 64380 Monterrey, N.L.">Burocratas 515, Col. Burócratas del Estado, 64380 Monterrey, N.L.</button></div>
            <div>${tag("span", "u.phone", "Teléfono / WhatsApp", "Phone / WhatsApp", 'class="k"')}<a class="v" href="tel:+528711079931">871 107 9931</a></div>
            <div>${tag("span", "u.hours", "Horario", "Hours", 'class="k"')}
              <div class="hours-table" id="hours">
                <span data-days="1,2,3,4,5" data-i18n="u.wk">${tr("u.wk", "Lunes a viernes", "Monday to Friday")}</span><span data-days="1,2,3,4,5" data-i18n="u.wkT">${tr("u.wkT", "9:00 am a 7:00 pm", "9:00 am to 7:00 pm")}</span>
                <span data-days="6" data-i18n="u.sat">${tr("u.sat", "Sábado", "Saturday")}</span><span data-days="6" data-i18n="u.satT">${tr("u.satT", "9:00 am a 3:00 pm", "9:00 am to 3:00 pm")}</span>
                <span data-days="0" data-i18n="u.sun">${tr("u.sun", "Domingo", "Sunday")}</span><span data-days="0" data-i18n="u.closed">${tr("u.closed", "Cerrado", "Closed")}</span>
              </div>
            </div>
            <a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/search/?api=1&amp;query=Burocratas%20515%2C%20Bur%C3%B3cratas%20del%20Estado%2C%2064380%20Monterrey%2C%20N.L." target="_blank" rel="noopener noreferrer"><span data-i18n="u.dir">${tr("u.dir", "Cómo llegar", "Get directions")}</span><svg aria-hidden="true"><use href="#i-arrow"/></svg></a>
          </div>
          <div class="card map reveal" style="--delay:.1s" id="map">
            <div class="map-gate">
              ${tag("p", "u.mapP", "El mapa lo carga Google y puede usar cookies. Se muestra solo si lo permites.", "The map is loaded by Google and may use cookies. It only appears if you allow it.")}
              ${tag("button", "u.mapB", "Mostrar mapa", "Show map", 'class="btn btn-ghost btn-sm" type="button" data-allow-map')}
            </div>
          </div>
        </div>
      </div>
    </main>`
});

/* ================= Legales (bloques completos por idioma) ================= */
function legal(file, titleKey, tEs, tEn, desc, es, en) {
  page({
    file, titleKey: titleKey, titleEs: tEs + " | Taller Wolf", titleEn: tEn + " | Taller Wolf", desc,
    main: `  <main class="page legal">
      <div class="container">
        <a class="back reveal" href="index.html"><svg aria-hidden="true"><use href="#i-left"/></svg><span data-i18n="l.back">${tr("l.back", "Volver al inicio", "Back to home")}</span></a>
        ${tag("h1", titleKey + ".h", tEs, tEn, 'class="display reveal"')}
        ${tag("p", "l.updated", "Última actualización: 24 de noviembre de 2026", "Last updated: November 24, 2026", 'class="updated reveal"')}
        <div class="reveal" data-lang="es">${es}</div>
        <div class="reveal" data-lang="en" hidden>${en}</div>
      </div>
    </main>`
  });
}

legal("privacidad.html", "t.privacy", "Aviso de privacidad", "Privacy notice", "Cómo trata Taller Wolf los datos personales de sus clientes.", `
        <p class="note"><strong>Borrador para revisión.</strong> Antes de publicar, confirma con el taller el nombre legal del responsable y un correo de contacto, y de preferencia que lo revise un abogado.</p>
        <h2>Responsable</h2>
        <p><strong>Taller Wolf</strong> (en adelante, "el Taller"), con domicilio en Burocratas 515, Colonia Burócratas del Estado, Monterrey, Nuevo León, México, es responsable del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>
        <h2>Qué datos usamos</h2>
        <p>Solo los que tú decides compartirnos al pedir una cotización:</p>
        <ul><li>Nombre y teléfono o WhatsApp.</li><li>Datos de tu vehículo: marca, modelo, año, placas y kilometraje.</li><li>La descripción del servicio o falla que reportas.</li></ul>
        <p>No pedimos datos sensibles ni datos bancarios en este sitio.</p>
        <h2>Cómo se recaban</h2>
         <p>Al enviar el formulario, tu solicitud y los datos de tu vehículo se guardan en el sistema ReymenApp del Taller para preparar la cotización y responderte. Si eliges WhatsApp, se aplican también sus políticas.</p>
        <h2>Para qué los usamos</h2>
        <ul><li>Preparar y enviarte la cotización que pediste.</li><li>Agendar, dar seguimiento y entregar el servicio de tu vehículo.</li><li>Atender la garantía del trabajo realizado.</li></ul>
         <p>Solo si marcas la casilla opcional podrás recibir recordatorios de mantenimiento. Puedes revocar ese permiso por los medios de contacto indicados. No usamos tus datos para publicidad ni los vendemos.</p>
        <h2>Con quién se comparten</h2>
         <p>ReymenApp procesa los datos para el Taller. Si eliges WhatsApp, Meta también procesa esa comunicación conforme a su aviso. No vendemos tus datos; otros accesos dependen de la ley aplicable.</p>
        <h2>Tus derechos (ARCO)</h2>
        <p>Puedes pedir en cualquier momento acceder a tus datos, corregirlos, cancelarlos u oponerte a su uso, así como revocar tu consentimiento. Escríbenos por WhatsApp o llámanos al <a href="tel:+528711079931">871 107 9931</a> indicando tu nombre y qué necesitas; te responderemos en un plazo máximo de 20 días hábiles.</p>
        <h2>Cuánto tiempo los conservamos</h2>
        <p>Mientras sea necesario para darte el servicio y atender la garantía, y después el tiempo que pidan las leyes fiscales y comerciales.</p>
        <h2>Cookies y almacenamiento</h2>
        <p>Consulta la <a href="cookies.html">política de cookies</a>.</p>
        <h2>Cambios a este aviso</h2>
        <p>Si este aviso cambia, publicaremos la nueva versión en esta misma página con su fecha de actualización.</p>`, `
        <p class="note"><strong>Draft for review.</strong> Before publishing, confirm the business's legal name and a contact email with the shop, and ideally have a lawyer review it. The Spanish version prevails.</p>
        <h2>Data controller</h2>
        <p><strong>Taller Wolf</strong> ("the Shop"), located at Burocratas 515, Colonia Burócratas del Estado, Monterrey, Nuevo León, Mexico, is responsible for processing your personal data under Mexico's Federal Law on the Protection of Personal Data Held by Private Parties.</p>
        <h2>What data we use</h2>
        <p>Only what you choose to share with us when requesting a quote:</p>
        <ul><li>Your name and phone or WhatsApp number.</li><li>Your vehicle details: make, model, year, license plate and mileage.</li><li>A description of the service you need or the issue you're reporting.</li></ul>
        <p>We don't ask for sensitive or banking data on this site.</p>
        <h2>How it is collected</h2>
         <p>When you submit the form, your request and vehicle details are stored in the Shop's ReymenApp system so it can prepare a quote and reply. If you choose WhatsApp, its policies also apply.</p>
        <h2>What we use it for</h2>
        <ul><li>Preparing and sending the quote you requested.</li><li>Scheduling, following up on and delivering your vehicle's service.</li><li>Handling the warranty for the work performed.</li></ul>
         <p>Only if you select the optional checkbox may you receive maintenance reminders. You can withdraw this permission through the contact methods listed here. We do not use your data for advertising or sell it.</p>
        <h2>Who it is shared with</h2>
         <p>ReymenApp processes information for the Shop. If you choose WhatsApp, Meta also processes that communication under its own notice. We do not sell your data; other access depends on applicable law.</p>
        <h2>Your rights (ARCO)</h2>
        <p>You can ask at any time to access, correct or delete your data, object to its use, or withdraw your consent. Message us on WhatsApp or call <a href="tel:+528711079931">871 107 9931</a> with your name and request; we will reply within 20 business days at most.</p>
        <h2>How long we keep it</h2>
        <p>For as long as needed to provide the service and handle the warranty, and afterwards for the period required by tax and commercial law.</p>
        <h2>Cookies and storage</h2>
        <p>See the <a href="cookies.html">cookie policy</a>.</p>
        <h2>Changes to this notice</h2>
        <p>If this notice changes, we will publish the new version on this page with its update date.</p>`);

legal("terminos.html", "t.terms", "Términos y condiciones", "Terms and conditions", "Condiciones de uso del sitio y de los servicios de Taller Wolf.", `
        <p class="note"><strong>Borrador para revisión.</strong> Confirma estos puntos con el taller antes de publicar.</p>
        <h2>Sobre este sitio</h2>
        <p>Este sitio es informativo. Muestra los servicios, horarios y datos de contacto de Taller Wolf y te permite preparar una solicitud de cotización por WhatsApp. Usarlo no crea ningún contrato ni compromiso de compra.</p>
        <h2>Cotizaciones</h2>
        <ul><li>Las cotizaciones se envían por WhatsApp o en el taller y dependen del diagnóstico del vehículo.</li><li>Ningún trabajo inicia sin que apruebes la cotización por escrito.</li><li>Ningún trabajo adicional se realiza sin tu autorización previa.</li></ul>
        <h2>Garantía</h2>
        <ul><li><strong>Mano de obra:</strong> 90 días o 5,000 km, lo que ocurra primero.</li><li><strong>Refacciones:</strong> cuentan con la garantía de su fabricante.</li><li>Te entregamos las refacciones que se reemplazaron en tu vehículo.</li></ul>
        <h2>Horario</h2>
        <p>Lunes a viernes de 9:00 am a 7:00 pm y sábados de 9:00 am a 3:00 pm.</p>
        <h2>Uso del sitio</h2>
        <p>No está permitido usar este sitio para enviar mensajes automatizados, falsos o abusivos. El formulario tiene límites de envío para evitarlo.</p>
        <h2>Marca y contenido</h2>
        <p>El nombre, el logo y el contenido de este sitio pertenecen a Taller Wolf. No se pueden copiar ni usar sin permiso.</p>
        <h2>Privacidad</h2>
        <p>El uso de tus datos se explica en el <a href="privacidad.html">aviso de privacidad</a>.</p>
        <h2>Ley aplicable</h2>
        <p>Estos términos se rigen por las leyes de México. Para cualquier controversia, las partes se someten a los tribunales de Monterrey, Nuevo León.</p>`, `
        <p class="note"><strong>Draft for review.</strong> Confirm these points with the shop before publishing. The Spanish version prevails.</p>
        <h2>About this site</h2>
        <p>This site is informational. It shows Taller Wolf's services, hours and contact details and lets you prepare a quote request on WhatsApp. Using it does not create any contract or purchase commitment.</p>
        <h2>Quotes</h2>
        <ul><li>Quotes are sent on WhatsApp or at the shop and depend on the vehicle's diagnosis.</li><li>No work starts until you approve the quote in writing.</li><li>No additional work is done without your prior approval.</li></ul>
        <h2>Warranty</h2>
        <ul><li><strong>Labor:</strong> 90 days or 5,000 km, whichever comes first.</li><li><strong>Parts:</strong> covered by their manufacturer's warranty.</li><li>We hand you back the parts that were replaced in your vehicle.</li></ul>
        <h2>Hours</h2>
        <p>Monday to Friday from 9:00 am to 7:00 pm and Saturdays from 9:00 am to 3:00 pm.</p>
        <h2>Use of the site</h2>
        <p>You may not use this site to send automated, false or abusive messages. The form has sending limits to prevent this.</p>
        <h2>Brand and content</h2>
        <p>The name, logo and content of this site belong to Taller Wolf and may not be copied or used without permission.</p>
        <h2>Privacy</h2>
        <p>How your data is used is explained in the <a href="privacidad.html">privacy notice</a>.</p>
        <h2>Governing law</h2>
        <p>These terms are governed by the laws of Mexico. Any dispute will be handled by the courts of Monterrey, Nuevo León.</p>`);

legal("cookies.html", "t.cookies", "Política de cookies", "Cookie policy", "Qué guarda este sitio en tu navegador y qué servicios externos usa.", `
        <h2>Resumen</h2>
        <p>Este sitio <strong>no usa cookies propias</strong>, ni de publicidad, ni de analítica. Solo guarda en tu navegador unas preferencias para funcionar bien.</p>
        <h2>Lo que se guarda en tu navegador</h2>
        <ul><li><strong>tw-theme:</strong> si elegiste modo claro u oscuro.</li><li><strong>tw-lang:</strong> si elegiste español o inglés.</li><li><strong>tw-consent:</strong> tu elección sobre el mapa de Google.</li><li><strong>tw-last-send:</strong> la hora de tu último envío del formulario, para limitar envíos repetidos.</li></ul>
        <p>Esta información se queda en tu dispositivo; el Taller no la recibe.</p>
        <h2>Servicios externos</h2>
        <ul><li><strong>Google Maps:</strong> el mapa se carga solo si lo permites. Al cargarlo, Google puede usar sus propias cookies.</li><li><strong>Google Fonts:</strong> la tipografía se descarga de los servidores de Google. No usa cookies, pero Google recibe tu dirección IP al descargarla.</li><li><strong>WhatsApp:</strong> al tocar un botón de WhatsApp sales de este sitio y aplican las políticas de WhatsApp.</li></ul>
        <h2>Cambiar tu elección</h2>
        <p>Puedes borrar tus preferencias y volver a elegir cuando quieras.</p>
        <p><button class="btn btn-ghost btn-sm" type="button" data-reset-consent>Borrar mis preferencias</button></p>`, `
        <h2>Summary</h2>
        <p>This site <strong>uses no first-party cookies</strong>, no advertising and no analytics. It only stores a few preferences in your browser so it works properly.</p>
        <h2>What is stored in your browser</h2>
        <ul><li><strong>tw-theme:</strong> whether you chose light or dark mode.</li><li><strong>tw-lang:</strong> whether you chose Spanish or English.</li><li><strong>tw-consent:</strong> your choice about the Google map.</li><li><strong>tw-last-send:</strong> when you last sent the form, to limit repeated submissions.</li></ul>
        <p>This information stays on your device; the Shop never receives it.</p>
        <h2>External services</h2>
        <ul><li><strong>Google Maps:</strong> the map only loads if you allow it. Once loaded, Google may use its own cookies.</li><li><strong>Google Fonts:</strong> the typeface is downloaded from Google's servers. It uses no cookies, but Google receives your IP address when it is downloaded.</li><li><strong>WhatsApp:</strong> tapping a WhatsApp button takes you off this site and WhatsApp's policies apply.</li></ul>
        <h2>Change your choice</h2>
        <p>You can clear your preferences and choose again at any time.</p>
        <p><button class="btn btn-ghost btn-sm" type="button" data-reset-consent>Clear my preferences</button></p>`);

/* ---------- Diccionario en inglés ---------- */
fs.writeFileSync(path.join(out, "assets", "i18n-en.js"),
  "/* Textos en inglés. Generado por herramientas/paginas-v8.js: edita los textos ahí, no aquí. */\nwindow.TW_EN = " + JSON.stringify(EN, null, 1) + ";\n");
fs.writeFileSync(path.join(out, "assets", "vehicle-catalog.js"),
  "/* Sugerencias de marcas y modelos; la captura permite otros vehículos. Generado desde src/lib/workshop/vehicle-catalog.json. */\nwindow.TW_VEHICLES = " + JSON.stringify(vehicleCatalog) + ";\n");
console.log("ok: páginas y", Object.keys(EN).length, "textos en inglés");

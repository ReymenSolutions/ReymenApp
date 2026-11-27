/* Taller Wolf · v8 · interacciones. Sin dependencias; todo corre en el navegador del visitante. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- Textos que arma JavaScript (español / inglés) ---------- */
  var T = {
    es: {
      dark: "Cambiar a modo oscuro", light: "Cambiar a modo claro", toEn: "Cambiar idioma a inglés", toEs: "Cambiar idioma a español",
      open: "Abierto ahora", closes: "cierra a las", closed: "Cerrado", opens: "abre", today: "hoy a las", tomorrow: "mañana a las", on: "el", at: "a las",
      days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
      copied: "Dirección copiada", saved: "Preferencia guardada", savedMap: "Preferencia guardada: mapa permitido", cleared: "Preferencias borradas",
      req: "Este dato es necesario.", name: "Escribe tu nombre.", phone: "Escribe un teléfono de 10 dígitos.", year: "Escribe el año con 4 dígitos (2018).",
      km: "Escribe solo números (85000).", plates: "Escribe las placas sin símbolos.", issue: "Describe el servicio o la falla con al menos 5 caracteres.", consent: "Necesitas aceptar el aviso de privacidad para continuar.",
      chatSoon: "¡Gracias por escribir! Muy pronto podré responderte aquí. Mientras tanto, escríbenos por WhatsApp y te atendemos en minutos.",
      bot: "Intenta de nuevo en unos segundos.", wait: "Espera {s} s para enviar otra cotización.", sending: "Enviando solicitud…", sent: "Solicitud recibida. Taller Wolf se pondrá en contacto contigo.", sendError: "No pudimos recibir tu solicitud. Revisa los datos o escríbenos por WhatsApp.", sendUnconfirmed: "No pudimos confirmar el envío. Es posible que ya haya llegado; antes de intentarlo otra vez, escríbenos por WhatsApp.",
      mapTitle: "Mapa: Burocratas 515, Colonia Burócratas del Estado, 64380 Monterrey, N.L."
    },
    en: {
      dark: "Switch to dark mode", light: "Switch to light mode", toEn: "Switch language to English", toEs: "Switch language to Spanish",
      open: "Open now", closes: "closes at", closed: "Closed", opens: "opens", today: "today at", tomorrow: "tomorrow at", on: "on", at: "at",
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      copied: "Address copied", saved: "Preference saved", savedMap: "Preference saved: map allowed", cleared: "Preferences cleared",
      req: "This field is required.", name: "Enter your name.", phone: "Enter a 10-digit phone number.", year: "Enter the year with 4 digits (2018).",
      km: "Numbers only (85000).", plates: "Enter the plate without symbols.", issue: "Describe the service or issue using at least 5 characters.", consent: "You need to accept the privacy notice to continue.",
      chatSoon: "Thanks for writing! I’ll be able to answer here very soon. In the meantime, message us on WhatsApp and we’ll help you in minutes.",
      bot: "Please try again in a few seconds.", wait: "Wait {s} s before sending another quote.", sending: "Sending request…", sent: "Request received. Taller Wolf will contact you.", sendError: "We could not receive your request. Check the details or message us on WhatsApp.", sendUnconfirmed: "We could not confirm delivery. Your request may have arrived; please message us on WhatsApp before trying again.",
      mapTitle: "Map: Burocratas 515, Colonia Burócratas del Estado, 64380 Monterrey, N.L."
    }
  };
  var lang = store.get("tw-lang") === "en" ? "en" : "es";
  var t = function (k) { return T[lang][k]; };

  /* ---------- Avisos ---------- */
  function toast(msg) {
    var box = $("#toasts");
    if (!box) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add("out"); }, 2400);
    setTimeout(function () { el.remove(); }, 2800);
  }

  /* ---------- Idioma ---------- */
  var EN = window.TW_EN || {};
  var langListeners = [];
  function applyLang(next) {
    lang = next;
    root.lang = lang === "en" ? "en" : "es-MX";
    root.classList.toggle("lang-en", lang === "en");
    $$("[data-i18n]").forEach(function (el) {
      if (el.__es === undefined) el.__es = el.innerHTML;
      var k = el.getAttribute("data-i18n");
      el.innerHTML = lang === "en" && EN[k] != null ? EN[k] : el.__es;
    });
    [["data-i18n-ph", "placeholder"], ["data-i18n-aria", "aria-label"]].forEach(function (pair) {
      $$("[" + pair[0] + "]").forEach(function (el) {
        var store_ = "__es_" + pair[1];
        if (el[store_] === undefined) el[store_] = el.getAttribute(pair[1]);
        var k = el.getAttribute(pair[0]);
        el.setAttribute(pair[1], lang === "en" && EN[k] != null ? EN[k] : el[store_]);
      });
    });
    $$("[data-lang]").forEach(function (el) { el.hidden = el.getAttribute("data-lang") !== lang; });
    $$("[data-lang-toggle]").forEach(function (b) { b.setAttribute("aria-label", lang === "en" ? t("toEs") : t("toEn")); });
    syncThemeToggles();
    langListeners.forEach(function (fn) { fn(); });
    root.classList.remove("i18n-pending");
  }
  $$("[data-lang-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = lang === "en" ? "es" : "en";
      store.set("tw-lang", next);
      applyLang(next);
    });
  });

  /* ---------- Tema ---------- */
  function syncThemeToggles() {
    var dark = root.getAttribute("data-theme") === "dark";
    $$("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-checked", dark ? "true" : "false");
      b.setAttribute("aria-label", dark ? t("light") : t("dark"));
    });
  }
  function setTheme(v) {
    root.classList.add("theme-anim");
    root.setAttribute("data-theme", v);
    store.set("tw-theme", v);
    syncThemeToggles();
    clearTimeout(setTheme._t);
    setTheme._t = setTimeout(function () { root.classList.remove("theme-anim"); }, 500);
  }
  $$("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () { setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"); });
  });

  /* ---------- Onda al hacer clic ---------- */
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".btn");
    if (!b || reduceMotion) return;
    var r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2.2, dot = document.createElement("span");
    dot.className = "ripple-dot";
    dot.style.width = dot.style.height = size + "px";
    dot.style.left = (e.clientX - r.left - size / 2) + "px";
    dot.style.top = (e.clientY - r.top - size / 2) + "px";
    b.appendChild(dot);
    setTimeout(function () { dot.remove(); }, 650);
  });

  /* ---------- Lobo ----------
     Al pasar el mouse: el lobo crece lento, los ojos se encienden en rojo y sale humo
     (una ráfaga y luego humo continuo mientras el mouse siga encima).
     Anti-abuso: no puede volver a empezar mientras quede un solo rastro de humo. */
  // Foto de humo hecha con ChatGPT (blanco sobre negro). Se pueden agregar más: humo-2.webp, humo-3.webp…
  var PHOTOS = { smoke: ["assets/humo/humo-1.webp"] };
  var CROP = { x: 195, y: 55, w: 430, h: 530 };              // recorte del logo que se muestra
  var EYES = [                                                // en píxeles del logo original
    { side: -1, center: [365.2, 294.6], outer: [354.5, 286.0], angle: 29 },
    { side: 1, center: [458.6, 296.0], outer: [470.4, 288.0], angle: 24 }
  ];
  var pct = function (p) { return [(p[0] - CROP.x) / CROP.w * 100, (p[1] - CROP.y) / CROP.h * 100]; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  function spawnPuff(wolf, ei, delay, ember) {
    var eye = EYES[ei], layer = $(".wolf-smoke", wolf), w = wolf.getBoundingClientRect().width, big = w > 140;
    var outline = $('.rim[data-eye="' + (ei ? "r" : "l") + '"]', wolf);
    var src;
    if (outline && outline.getTotalLength) {                // cualquier punto de la orilla del ojo
      var q = outline.getPointAtLength(Math.random() * outline.getTotalLength());
      src = [q.x, q.y];
    } else src = eye.center;
    var at = pct(src);
    var ang = (eye.angle + 8 + rnd(-8, 10)) * Math.PI / 180;   // diagonal hacia arriba y hacia afuera
    var dist = w * rnd(.16, .38);
    var dx = eye.side * Math.cos(ang) * dist, dy = -Math.sin(ang) * dist;
    var p = document.createElement("span");
    var sprite = PHOTOS.smoke.length ? PHOTOS.smoke[Math.floor(Math.random() * PHOTOS.smoke.length)] : null;
    var sw, sh;
    if (sprite) {
      // Banda de humo horizontal: piezas anchas y bajitas, acostadas, que se abren hacia los lados.
      // La imagen es una voluta en diagonal; al estirarla a 3:1 su diagonal queda a ~18°,
      // así que se gira ese ángulo (espejo incluido) para dejarla casi horizontal.
      var fx = Math.random() < .5 ? -1 : 1;
      sw = Math.max(big ? 80 : 16, w * rnd(.26, .46)); sh = sw / rnd(1.5, 2.2);
      p.className = "puff sprite";
      p.style.setProperty("--img", "url(\"" + new URL(sprite, document.baseURI).href + "\")");   // ruta completa (si no, se resuelve desde assets/)
      p.style.setProperty("--fx", fx);
      p.style.setProperty("--rot", (fx * 18 + rnd(-9, 9)).toFixed(0) + "deg");
      var mid = Math.random() < .18;                       // algunas piezas cruzan entre los dos ojos
      at = mid ? pct([(EYES[0].center[0] + EYES[1].center[0]) / 2 + rnd(-10, 10), (EYES[0].center[1] + EYES[1].center[1]) / 2 + rnd(-4, 3)])
               : pct([eye.center[0] + eye.side * rnd(-4, 26), eye.center[1] + rnd(-11, 9)]);   // alrededor del ojo, hacia afuera
      dx = eye.side * w * rnd(.05, .14); dy = -w * rnd(0, .025); dist = 0;   // se abre hacia los lados, casi sin subir
      if (mid) dx *= .35;
    } else {
      var size = Math.max(big ? 9 : 2.5, w * rnd(.03, .065));
      sw = size * 2.1; sh = size;
      p.className = "puff";
      p.style.setProperty("--rot", (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1) + "deg");
      p.style.setProperty("--pc", ember ? "255, 96, 60" : "var(--smoke)");
    }
    p.style.left = at[0] + "%";
    p.style.top = at[1] + "%";
    p.style.setProperty("--w", sw.toFixed(1) + "px");
    p.style.setProperty("--h", sh.toFixed(1) + "px");
    p.style.setProperty("--spin", rnd(-12, 12).toFixed(0) + "deg");
    p.style.setProperty("--mx", (dx * .5 + eye.side * rnd(-.02, .02) * w).toFixed(1) + "px");
    p.style.setProperty("--my", (dy * .5).toFixed(1) + "px");
    p.style.setProperty("--tx", dx.toFixed(1) + "px");
    p.style.setProperty("--ty", (dy - dist * .18).toFixed(1) + "px");   // al final sube un poco más
    p.style.setProperty("--o", (ember ? .6 : sprite ? rnd(.6, .9) : rnd(.42, .72)).toFixed(2));
    var dur = sprite ? rnd(3, 4.6) : rnd(1.8, 2.8);
    if (sprite) { p.style.setProperty("--o", rnd(.22, .42).toFixed(2)); p.style.setProperty("--spin", rnd(-7, 7).toFixed(0) + "deg"); }
    p.style.setProperty("--d", dur.toFixed(2) + "s");
    p.style.setProperty("--delay", delay.toFixed(2) + "s");
    wolf._live = (wolf._live || 0) + 1;
    var gone = false;
    var finishPuff = function () {
      if (gone) return;
      gone = true;
      layer.removeChild(p);
      wolf._live--;
      checkDone(wolf);
    };
    p.addEventListener("animationend", finishPuff);
    setTimeout(finishPuff, (delay + dur) * 1000 + 800);    // por si el navegador no avisa el final
    layer.appendChild(p);
  }
  function checkDone(wolf) {
    if (wolf._emitting || wolf._live > 0) return;
    wolf.classList.remove("awake");
    wolf._busy = false;
  }
  // holdMs: cuánto dura el humo continuo cuando no hay mouse (carga de la portada o toque en celular)
  function wake(wolf, holdMs) {
    if (wolf._busy) return;                      // todavía queda humo: se ignora
    wolf._busy = true;
    wolf._live = 0;
    wolf.classList.add("awake");
    if (reduceMotion) { setTimeout(function () { wolf.classList.remove("awake"); wolf._busy = false; }, 1500); return; }
    var big = wolf.getBoundingClientRect().width > 140;
    // ráfaga inicial
    var cloud = PHOTOS.smoke.length > 0;
    for (var ei = 0; ei < 2; ei++) for (var i = 0; i < (cloud ? (big ? 7 : 3) : (big ? 18 : 6)); i++) spawnPuff(wolf, ei, rnd(0, cloud ? 1 : .6), i < 2);
    // humo continuo mientras siga el mouse encima (máximo 12 s)
    var until = performance.now() + (holdMs || 12000), tick = 0;
    wolf._emitting = true;
    clearInterval(wolf._timer);
    wolf._timer = setInterval(function () {
      var keep = performance.now() < until && (holdMs || wolf.classList.contains("hovering"));
      if (!keep) { clearInterval(wolf._timer); wolf._emitting = false; checkDone(wolf); return; }
      tick++;
      if (cloud && tick % 3) return;          // la nube se renueva más despacio
      if (big) { spawnPuff(wolf, 0, 0, false); spawnPuff(wolf, 1, 0, false); }
      else if (tick % 2 === 0) spawnPuff(wolf, tick % 4 === 0 ? 0 : 1, 0, false);
    }, 100);
  }
  $$("[data-wolf]").forEach(function (wolf) {
    wolf.addEventListener("mouseenter", function () { wolf.classList.add("hovering"); wake(wolf); });
    wolf.addEventListener("mouseleave", function () { wolf.classList.remove("hovering"); });
    wolf.addEventListener("touchstart", function () {
      wolf.classList.add("hovering");
      clearTimeout(wolf._lift);
      wolf._lift = setTimeout(function () { wolf.classList.remove("hovering"); }, 2600);
      wake(wolf, 2400);
    }, { passive: true });
    if (wolf.hasAttribute("data-autoplay")) setTimeout(function () { wake(wolf, 1600); }, 1100);
  });

  /* ---------- Scroll: header, volver arriba, WhatsApp flotante ---------- */
  var header = $("#header"), toTop = $("#to-top"), waFloat = $("#wa-float");
  function onScroll() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    if (header) header.classList.toggle("scrolled", y > 8);
    if (toTop) { toTop.classList.toggle("show", y > 400); toTop.style.setProperty("--p", max > 0 ? Math.min(1, y / max) : 0); }
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });
  if (waFloat) setTimeout(function () { waFloat.classList.add("show"); }, 900);

  /* ---------- Menú móvil ---------- */
  var menuBtn = $("#menu-btn"), sheet = $("#sheet");
  function closeMenu() {
    if (!sheet || !menuBtn) return;
    sheet.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.querySelector("use").setAttribute("href", "#i-menu");
  }
  if (menuBtn && sheet) {
    menuBtn.addEventListener("click", function () {
      var open = !sheet.classList.contains("open");
      sheet.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.querySelector("use").setAttribute("href", open ? "#i-x" : "#i-menu");
    });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  /* ---------- Aparición al hacer scroll ---------- */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add("in"); });

  /* ---------- Cifras que cuentan ---------- */
  var counters = $$("[data-count]");
  if (counters.length && "IntersectionObserver" in window && !reduceMotion) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        co.unobserve(en.target);
        var el = en.target, end = +el.getAttribute("data-count"), t0 = performance.now(), dur = 1600;
        (function tick(now) {
          var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
          el.textContent = Math.round(end * e).toLocaleString("en-US");
          if (k < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { co.observe(c); });
  }

  /* ---------- Brillo que sigue al mouse ---------- */
  document.addEventListener("pointermove", function (e) {
    var c = e.target.closest && e.target.closest(".card");
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty("--mx", (e.clientX - r.left) + "px");
    c.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  /* ---------- Portada: los puntos del pizarrón se iluminan alrededor del mouse ---------- */
  var hero = $(".hero"), decor = $(".decor");
  if (hero && decor && window.matchMedia && matchMedia("(hover: hover)").matches && !reduceMotion) {
    var sx = 0, sy = 0, tx = 0, ty = 0, raf = 0;
    var follow = function () {
      sx += (tx - sx) * .14; sy += (ty - sy) * .14;           // sigue al mouse con suavidad
      decor.style.setProperty("--sx", sx.toFixed(1) + "px");
      decor.style.setProperty("--sy", sy.toFixed(1) + "px");
      raf = Math.abs(tx - sx) + Math.abs(ty - sy) > .5 ? requestAnimationFrame(follow) : 0;
    };
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top;
      if (!decor.style.getPropertyValue("--spot-on")) { sx = tx; sy = ty; }
      decor.style.setProperty("--spot-on", "1");
      if (!raf) raf = requestAnimationFrame(follow);
    });
    hero.addEventListener("pointerleave", function () { decor.style.setProperty("--spot-on", "0"); });
  }

  /* ---------- WhatsApp: mensajes prellenados (siempre en español, los lee el taller) ---------- */
  var WA = "https://wa.me/528711079931";
  var waLink = function (text) { return WA + "?text=" + encodeURIComponent(text); };
  $$(".js-wa[data-msg]").forEach(function (a) { a.href = waLink(a.getAttribute("data-msg")); });
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Servicios: ventana emergente ---------- */
  var modal = $("#service-modal");
  if (modal && modal.showModal) {
    var closeModal = function () {
      if (!modal.open || modal.classList.contains("closing")) return;
      modal.classList.add("closing");
      setTimeout(function () { modal.classList.remove("closing"); modal.close(); }, reduceMotion ? 0 : 210);
    };
    $$(".service").forEach(function (c) {
      c.addEventListener("click", function () {
        var img = $("#m-img");
        img.src = c.getAttribute("data-img");
        img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";
        $("#m-title").textContent = $(".svc-title", c).textContent;
        $("#m-desc").textContent = $(".svc-desc", c).textContent;
        $("#m-cta").href = waLink("Hola Taller Wolf, quiero cotizar: " + c.getAttribute("data-wa") + ".");
        modal.showModal();
      });
    });
    modal.addEventListener("click", function (e) { if (e.target === modal || e.target.closest("[data-close]")) closeModal(); });
    modal.addEventListener("cancel", function (e) { e.preventDefault(); closeModal(); });
    $("#m-cta").addEventListener("click", function () { setTimeout(closeModal, 150); });
  }

  /* ---------- Proceso: se llena paso por paso, a su propio ritmo ---------- */
  var steps = $("#steps");
  if (steps) {
    var nodes = $$(".step .n", steps), items = $$(".step", steps), line = $(".steps-line", steps), fill = $(".steps-fill", steps);
    var fracs = [];
    var layout = function () {
      var base = steps.getBoundingClientRect();
      var c = nodes.map(function (n) { var r = n.getBoundingClientRect(); return [r.left + r.width / 2 - base.left, r.top + r.height / 2 - base.top]; });
      var horizontal = Math.abs(c[0][1] - c[c.length - 1][1]) < 4;
      steps.classList.toggle("horizontal", horizontal);
      var a = horizontal ? 0 : 1, len = c[c.length - 1][a] - c[0][a];
      fracs = c.map(function (p) { return len ? (p[a] - c[0][a]) / len : 0; });
      line.style.left = (horizontal ? c[0][0] : c[0][0] - 1) + "px";
      line.style.top = (horizontal ? c[0][1] - 1 : c[0][1]) + "px";
      line.style.width = (horizontal ? len : 2) + "px";
      line.style.height = (horizontal ? 2 : len) + "px";
      line.style.right = line.style.bottom = "auto";
    };
    layout();
    addEventListener("resize", layout);
    var play = function () {
      var PAUSE = 420, SEG = 900, i = 0;
      var ease = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
      var light = function (k) { items[k].classList.add("lit"); };
      var next = function () {
        light(i);
        if (i === items.length - 1) { setTimeout(function () { steps.classList.add("done"); }, 600); return; }
        var from = fracs[i], to = fracs[i + 1];
        setTimeout(function () {
          var t0 = performance.now();
          (function frame(now) {
            var k = Math.min(1, (now - t0) / SEG);
            fill.style.setProperty("--p", (from + (to - from) * ease(k)).toFixed(4));
            if (k < 1) requestAnimationFrame(frame); else { i++; next(); }
          })(t0);
        }, PAUSE);
      };
      next();
    };
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (li) { li.classList.add("lit"); }); fill.style.setProperty("--p", 1); steps.classList.add("done");
    } else {
      var so = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { so.disconnect(); setTimeout(play, 350); }
      }, { threshold: 0.45 });
      so.observe(steps);
    }
  }

  /* ---------- Abierto / cerrado (hora de Monterrey) ---------- */
  var status = $("#status"), statusText = $("#status-text");
  var HOURS = { 1: [9, 19], 2: [9, 19], 3: [9, 19], 4: [9, 19], 5: [9, 19], 6: [9, 15] };
  var fmt = function (h) { return (h > 12 ? h - 12 : h) + ":00 " + (h >= 12 ? "pm" : "am"); };
  function nowMty() {
    var parts = {};
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Monterrey", weekday: "short", hour: "numeric", minute: "numeric", hour12: false })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) { return null; }
    return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), h: (+parts.hour % 24) + (+parts.minute) / 60 };
  }
  function updateStatus() {
    var n = nowMty();
    if (!n) return;
    $$("#hours [data-days]").forEach(function (el) { el.classList.toggle("today", el.getAttribute("data-days").split(",").indexOf(String(n.day)) > -1); });
    if (!status || !statusText) return;
    var today = HOURS[n.day], open = today && n.h >= today[0] && n.h < today[1];
    status.classList.toggle("open", !!open);
    if (open) { statusText.innerHTML = "<strong>" + t("open") + "</strong> · " + t("closes") + " " + fmt(today[1]); return; }
    var label;
    if (today && n.h < today[0]) label = t("today") + " " + fmt(today[0]);
    else {
      var d = n.day;
      do { d = (d + 1) % 7; } while (!HOURS[d]);
      label = d === (n.day + 1) % 7 ? t("tomorrow") + " " + fmt(HOURS[d][0]) : t("on") + " " + t("days")[d] + " " + t("at") + " " + fmt(HOURS[d][0]);
    }
    statusText.innerHTML = "<strong>" + t("closed") + "</strong> · " + t("opens") + " " + label;
  }
  langListeners.push(updateStatus);
  setInterval(updateStatus, 60000);

  /* ---------- Copiar dirección ---------- */
  var copyBtn = $("#copy-address");
  if (copyBtn) copyBtn.addEventListener("click", function () {
    var text = copyBtn.getAttribute("data-copy");
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(t("copied")); }, function () { toast(text); });
    else toast(text);
  });

  /* ---------- Cookies y mapa ---------- */
  var cookie = $("#cookie"), map = $("#map");
  // Con el código postal (64380) Google ubica la dirección exacta y pone su pin rojo.
  var MAP_Q = "Burocratas%20515%2C%20Bur%C3%B3cratas%20del%20Estado%2C%2064380%20Monterrey%2C%20N.L.";
  function loadMap() {
    if (!map || map.querySelector("iframe")) return;
    var f = document.createElement("iframe");
    f.title = t("mapTitle");
    f.src = "https://www.google.com/maps?q=" + MAP_Q + "&z=17&hl=" + (lang === "en" ? "en" : "es") + "&output=embed";
    f.loading = "lazy";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    map.innerHTML = "";
    map.appendChild(f);
  }
  function setConsent(v) { store.set("tw-consent", v); if (cookie) cookie.hidden = true; if (v === "all") loadMap(); }
  var consent = store.get("tw-consent");
  if (consent === "all") loadMap();
  if (cookie && !consent) setTimeout(function () { cookie.hidden = false; }, 1200);
  $$("[data-consent]").forEach(function (b) {
    b.addEventListener("click", function () { var v = b.getAttribute("data-consent"); setConsent(v); toast(v === "all" ? t("savedMap") : t("saved")); });
  });
  $$("[data-allow-map]").forEach(function (b) { b.addEventListener("click", function () { setConsent("all"); }); });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("[data-reset-consent]")) return;
    store.del("tw-consent"); toast(t("cleared")); if (cookie) cookie.hidden = false;
  });

  /* ---------- Formulario de cotización ---------- */
  var form = $("#quote-form");
  if (form) {
    var fields = { nombre: "nombre", telefono: "telefono", marca: "marca", modelo: "modelo", anio: "anio", placas: "placas", kilometraje: "km", falla: "falla" };
    var vehicleCatalog = window.TW_VEHICLES || {}, makeList = $("#vehicle-makes"), modelList = $("#vehicle-models");
    function closePicker(input, list) { list.hidden = true; input.setAttribute("aria-expanded", "false"); }
    function showPicker(input, list, options, choose) {
      var term = input.value.trim().toLocaleLowerCase();
      list.replaceChildren();
      options.filter(function (option) { return option.toLocaleLowerCase().includes(term); }).slice(0, 40).forEach(function (option) {
        var button = document.createElement("button"); button.type = "button"; button.className = "vehicle-picker-option"; button.setAttribute("role", "option"); button.textContent = option;
        button.addEventListener("mousedown", function (event) { event.preventDefault(); });
        button.addEventListener("click", function () { input.value = option; choose(); closePicker(input, list); input.focus(); });
        list.appendChild(button);
      });
      if (!list.children.length) { var note = document.createElement("span"); note.className = "vehicle-picker-empty"; note.textContent = options.length ? (lang === "es" ? "Puedes escribir una opción nueva" : "You can type a new option") : (lang === "es" ? "Selecciona primero la marca" : "Choose a make first"); list.appendChild(note); }
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    var selectedMake = $("#f-marca").value.trim();
    var updateModels = function () {
      var current = $("#f-marca").value.trim();
      var match = Object.keys(vehicleCatalog).find(function (make) { return make.toLowerCase() === current.toLowerCase(); }) || "";
      if (selectedMake !== current) { $("#f-modelo").value = ""; selectedMake = current; }
      closePicker($("#f-modelo"), modelList);
      return match ? vehicleCatalog[match] : [];
    };
    var makeInput = $("#f-marca"), modelInput = $("#f-modelo");
    makeInput.addEventListener("input", function () { updateModels(); showPicker(makeInput, makeList, Object.keys(vehicleCatalog), updateModels); });
    modelInput.addEventListener("input", function () { showPicker(modelInput, modelList, updateModels(), function () {}); });
    [[makeInput, makeList, function () { return Object.keys(vehicleCatalog); }, updateModels], [modelInput, modelList, updateModels, function () {}]].forEach(function (picker) {
      var input = picker[0], list = picker[1], options = picker[2], choose = picker[3];
      input.addEventListener("focus", function () { showPicker(input, list, options(), choose); });
      input.addEventListener("keydown", function (event) { if (event.key === "Escape") closePicker(input, list); });
      input.addEventListener("blur", function () { setTimeout(function () { closePicker(input, list); }, 180); });
      input.parentNode.querySelector(".vehicle-picker-toggle").addEventListener("click", function () { if (list.hidden) { showPicker(input, list, options(), choose); input.focus(); } else closePicker(input, list); });
    });
    updateModels();
    var maxYear = new Date().getFullYear() + 1, LIMIT_MS = 30000, MIN_FILL_MS = 3000, openedAt = Date.now();
    var fieldInput = function (k) { return document.getElementById("f-" + fields[k]); };
    var clean = function (s) { return s.replace(/[\u0000-\u001f\u007f<>{}]/g, "").trim().replace(/\s+/g, " "); };
    var value = function (k) { return clean(fieldInput(k).value); };
    var check = function (k) {
      var v = value(k), msg = "";
      if (!v) { if (k !== "placas" && k !== "kilometraje") msg = t("req"); }
      else if (k === "nombre" && v.length < 2) msg = t("name");
      else if (k === "telefono" && (v.replace(/\D/g, "").length < 10 || v.replace(/\D/g, "").length > 15)) msg = t("phone");
      else if (k === "anio" && (!/^\d{4}$/.test(v) || +v < 1950 || +v > maxYear)) msg = t("year");
      else if (k === "kilometraje" && !/^\d[\d.,]*$/.test(v)) msg = t("km");
      else if (k === "placas" && !/^[A-Za-z0-9 -]{4,12}$/.test(v)) msg = t("plates");
      else if (k === "falla" && v.length < 5) msg = t("issue");
      var el = fieldInput(k), err = document.getElementById("e-" + fields[k]);
      el.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg) el.setAttribute("aria-describedby", err.id); else el.removeAttribute("aria-describedby");
      err.textContent = msg;
      return !msg;
    };
    Object.keys(fields).forEach(function (k) {
      fieldInput(k).addEventListener("blur", function () { if (this.value) check(k); });
      fieldInput(k).addEventListener("input", function () { if (this.getAttribute("aria-invalid") === "true") check(k); });
    });
    // al cambiar de idioma, los errores visibles se vuelven a escribir en el idioma nuevo
    langListeners.push(function () { Object.keys(fields).forEach(function (k) { if (fieldInput(k).getAttribute("aria-invalid") === "true") check(k); }); });
    var consentBox = $("#f-consent"), consentErr = $("#e-consent");
    var submitButton = form.querySelector('button[type="submit"]'), status = $("#quote-status"), successPanel = $("#quote-success");
    $("#quote-again").addEventListener("click", function () { successPanel.hidden = true; form.hidden = false; status.hidden = true; form.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" }); $("#f-nombre").focus({ preventScroll: true }); });
    var requestKey = null, requestSignature = null, pending = false;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (pending) return;
      if ($("#f-web").value || Date.now() - openedAt < MIN_FILL_MS) { toast(t("bot")); return; }
      var bad = null;
      Object.keys(fields).forEach(function (k) { if (!check(k) && !bad) bad = fieldInput(k); });
      consentErr.textContent = consentBox.checked ? "" : t("consent");
      if (bad) { bad.focus(); return; }
      if (!consentBox.checked) { consentBox.focus(); return; }
      var last = +(store.get("tw-last-send") || 0), wait = LIMIT_MS - (Date.now() - last);
      if (wait > 0) { toast(t("wait").replace("{s}", Math.ceil(wait / 1000))); return; }
      if (!window.crypto || !window.crypto.randomUUID) { status.hidden = false; status.textContent = t("sendError"); return; }
      var payload = { name: value("nombre"), phone: value("telefono"), marca: value("marca"), modelo: value("modelo"), anio: Number(value("anio")), placas: value("placas") || null, kilometraje: value("kilometraje") ? Number(value("kilometraje").replace(/[^\d]/g, "")) : null, servicioFalla: value("falla"), consent: true, maintenanceConsent: $("#f-maintenance-consent").checked, website: $("#f-web").value };
      var signature = JSON.stringify(payload);
      if (signature !== requestSignature) { requestKey = window.crypto.randomUUID(); requestSignature = signature; }
      pending = true;
      submitButton.disabled = true;
      status.hidden = false;
      status.textContent = t("sending");
      try {
        var body = JSON.stringify(Object.assign({ requestKey: requestKey }, payload));
        var confirmed = false, rejected = false;
        // El mismo requestKey permite repetir una petición cuya respuesta se perdió sin crear otro lead.
        for (var attempt = 0; attempt < 2 && !confirmed && !rejected; attempt++) {
          try {
            var response = await fetch("/api/workshop/public/inquiries", {
              method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body
            });
            var result = await response.json().catch(function () { return null; });
            confirmed = response.ok && result && result.success === true;
            rejected = response.status >= 400 && response.status < 500;
          } catch (error) { /* Es posible que el servidor haya guardado la solicitud antes de perder la respuesta. */ }
        }
        if (!confirmed) { status.textContent = t(rejected ? "sendError" : "sendUnconfirmed"); return; }
        store.set("tw-last-send", String(Date.now()));
        requestKey = null;
        requestSignature = null;
        form.reset();
        updateModels();
        form.hidden = true;
        successPanel.hidden = false;
        successPanel.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "center" });
        successPanel.querySelector("h2").focus({ preventScroll: true });
      } catch (error) {
        status.textContent = t("sendUnconfirmed");
      } finally {
        pending = false;
        submitButton.disabled = false;
      }
    });
  }

  /* ---------- Chatbot (por ahora solo la interfaz; se conecta después) ---------- */
  var chat = $("#chat");
  if (chat) {
    var fab = $("#chat-fab"), panel = $("#chat-panel"), log = $("#chat-log"), chatForm = $("#chat-form"), input = $("#chat-input");
    var setChat = function (open) {
      chat.classList.toggle("open", open);
      panel.hidden = !open;
      fab.setAttribute("aria-expanded", String(open));
      if (open) setTimeout(function () { input.focus(); }, 60);
    };
    fab.addEventListener("click", function () { setChat(panel.hidden); });
    $("#chat-close").addEventListener("click", function () { setChat(false); fab.focus(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) { setChat(false); fab.focus(); } });
    var add = function (cls, text) {
      var p = document.createElement("p");
      p.className = "msg " + cls;
      if (text != null) p.textContent = text;
      log.appendChild(p);
      log.scrollTop = log.scrollHeight;
      return p;
    };
    var send = function (text) {
      text = (text || "").trim();
      if (!text) return;
      add("me", text);
      var quick = $("#chat-quick"); if (quick) quick.hidden = true;
      var typing = add("bot typing");
      typing.innerHTML = "<i></i><i></i><i></i>";
      // Aquí se conectará el asistente. Por ahora responde con un aviso.
      setTimeout(function () { typing.remove(); add("bot", t("chatSoon")); }, 900);
    };
    chatForm.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); input.value = ""; });
    $$("#chat-quick button").forEach(function (b) { b.addEventListener("click", function () { send(b.textContent); }); });
  }

  applyLang(lang);
})();

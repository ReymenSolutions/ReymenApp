# Fase 17 — Pruebas con usuarios reales: accesibilidad, uso y feedback

Alcance decidido: las tres partes completas (accesibilidad + analítica de
uso + mecanismo de feedback), pensado para un grupo de **clientes reales
de Reymen** usando sus tarjetas/perfiles en producción, más el equipo
interno usando el panel admin.

## 0. Diagnóstico actual

(Investigado antes de planear cualquier cambio -- código real, no
suposiciones genéricas de "buenas prácticas".)

**Accesibilidad -- sin herramientas de por medio** (no hay
`eslint-plugin-jsx-a11y`, `axe` ni config de lint especial en ningún
`package.json`). Hallazgos concretos:

- **Sin indicador de foco visible en todo `apps/public`**. `ProfileView.tsx`
  construye cada botón/link con `style={{...}}` a mano (contacto, guardar
  contacto, lista de links, redes sociales, tarjeta de ubicación) y
  `globals.css` no tiene ni un `:focus-visible` -- dependen del outline por
  default del navegador, que sobre formas circulares/pill hechas a mano
  normalmente queda cortado o invisible. Este es el hueco más grave: un
  cliente navegando su propia tarjeta por teclado (o cualquiera con
  dificultad motriz) no puede saber dónde está parado.
- **Contraste de color sin validar y depende del tema de cada cliente**.
  `accent_color`/`primary_color` los elige quien administra la tarjeta
  (`settings/themes/new`) con solo un check de formato (`#RRGGBB`), sin
  matemática de contraste. Esos colores terminan de fondo bajo texto/íconos
  con color fijo en `ProfileView.tsx` (el botón "Guardar contacto", los
  íconos de redes). Un cliente con colores de marca claros puede terminar
  con texto o íconos ilegibles sin que nada lo avise al configurar el tema.
- **En `apps/admin`, un solo patrón repetido en ~18 archivos** quita el
  outline nativo de todos los `<input>` (`outline-none
  focus:border-neutral-500`, sustituyéndolo solo por un cambio sutil de
  color de borde) -- mismo hueco de foco que en el público, pero
  corregible en un solo lugar porque es la misma clase repetida.
- Lo demás está mejor de lo esperado: cero `<div onClick>` (todo son
  `<a>`/`<button>` reales), labels bien asociados con `htmlFor`/`id` en
  admin, `alt` correcto en casi todos lados (excepto un thumbnail de
  media en `profiles/[id]/page.tsx` que usa `alt=""` pudiendo describir
  qué imagen es).

**Analítica -- ya existe una capa de negocio, no una de UX/errores**. La
tabla `events` (migración `20260905120008_events.sql`) y `logPublicEvent`
(`apps/public/lib/track.ts`) ya registran `profile_view` y clics en CTAs,
visible en `apps/admin/app/analytics/page.tsx`. Eso mide qué tan
efectiva es cada tarjeta para el negocio -- no mide errores de la
aplicación, ni dónde se traban los usuarios, ni uso del panel admin. No
hay Sentry, Google Analytics, Plausible, Umami ni nada de terceros. La
convención de logging de Fase 16 (`console.error('[tag] ...')` /
`console.log('[tag] ...')` a `docker logs`) es lo único parecido a
"instrumentación técnica" que existe hoy.

**Feedback -- no existe nada**. Sin formulario de contacto, sin
`error.tsx`/`global-error.tsx` en ninguna de las dos apps (un error de
React sin capturar hoy se ve como pantalla en blanco), sin ningún canal
para que alguien reporte un problema.

## 1. Accesibilidad

- **Foco visible en `apps/public`**: regla global en `globals.css`
  (`a:focus-visible, button:focus-visible`) -- un solo color fijo de alto
  contraste con offset, no depende del tema de cada tarjeta (accent_color/
  primary_color los elige cada cliente y podrían coincidir con casi
  cualquier color, así que un halo "a juego" con el tema no es
  confiablemente visible).
- **Foco visible en `apps/admin`**: mismo mecanismo, un selector de
  elemento + `:focus-visible` en `globals.css` que le gana en
  especificidad a la clase `outline-none` repetida en cada input/select/
  textarea, sin tener que tocar los ~18 archivos que la usan.
- **Contraste al configurar el tema de una tarjeta**: implementado distinto
  a como se planeó aquí originalmente -- en vez de bloquear/advertir solo
  en el momento de guardar (que perdería lo que el admin ya llenó del
  formulario al mandarlo de vuelta), quedó como un indicador **persistente**:
  `packages/lib/src/contrast.ts` calcula la razón de contraste WCAG contra
  los dos colores fijos reales de `ProfileView.tsx` (`#262922` del botón
  "Guardar contacto", `#FFFFFF` del fondo de chip donde van los íconos), y
  tanto `/settings` (lista de themes) como `/settings/themes/{id}` (edición)
  muestran un aviso "⚠ contraste bajo" cuando un theme no pasa. No bloquea
  guardar en ningún momento. El formulario de creación (`/settings/themes/new`)
  no tiene con qué calcularlo todavía (no hay theme guardado), así que ahí
  solo hay un recordatorio de texto fijo.
- **`alt` del thumbnail de media en admin**: ya no es `alt=""` -- ahora
  dice "Foto actual del perfil" / "Logo actual del perfil".
- Fuera de esta fase: una auditoría automatizada tipo Lighthouse/axe-core
  corriendo en CI -- se puede agregar después si esta fase confirma que
  vale la pena esa inversión continua.

## 2. Analítica de uso técnica (nueva, junto a la de negocio ya existente)

- **Captura de errores sin manejar**: `error.tsx` y `global-error.tsx` en
  ambas apps (Next.js 16 renombró la prop del boundary a `retry`, no
  `reset` -- confirmado en `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`
  antes de escribir el código). Un error de React ya no deja pantalla en
  blanco -- muestra un mensaje razonable con botón de reintentar.
- **`console.error` de un error de cliente no llega solo a `docker logs`**:
  un error boundary corre en el navegador de quien lo vivió, así que
  loguearlo ahí solo queda en SU consola. En `apps/public` (el caso real
  de "cliente probando su tarjeta sin acceso a devtools"),
  `app/error.tsx` reenvía el error a `app/api/client-error/route.ts`, que
  sí corre en el servidor -- ahí se hace el `console.error` que llega a
  `docker logs` (convención de Fase 16) y además se registra como evento
  `client_error` en la tabla `events` ya existente (migración
  `20260912120001_client_error_event_type.sql`, visible en
  `/analytics`). En `apps/admin` se dejó solo el log de navegador -- es
  equipo interno con acceso a devtools, y agregar la misma ruta ahí no
  se justificaba para esta ronda.
- Fuera de esta fase: un dashboard nuevo de "salud técnica" separado del
  de analítica de negocio -- con lo que se registre arriba y en
  `/analytics` alcanza para esta ronda de pruebas; se decide un dashboard
  dedicado si el volumen de datos lo justifica después.

## 3. Mecanismo de feedback

- Un formulario simple de "reportar un problema": `/feedback` en
  `apps/public` (enlazado discretamente en el footer de cada perfil, con
  el slug precargado) y `/feedback` en `apps/admin` (nuevo link en
  `AdminHeader.tsx`) -- mismo idioma visual que el resto de los
  formularios de admin.
- Se guarda en la tabla nueva `feedback` (mensaje, de dónde vino -- perfil
  o admin, correo de contacto opcional, a qué perfil/qué admin se asocia,
  fecha) a través de una única función `submit_feedback()` SECURITY
  DEFINER (migración `20260912120002_feedback.sql`, mismo patrón que
  `log_event()`/`log_admin_action()`) -- así queda un registro
  consultable y no depende de que Resend esté funcionando para no perder
  ningún reporte. `/feedback` en admin lista los reportes de ambos
  orígenes (solo lectura, mismo criterio de acceso que `/analytics`:
  SUPERADMIN/ADMIN/VIEWER).
- Fuera de esta fase: triage/priorización de los reportes dentro del
  panel (marcarlos como resueltos, asignarlos, etc.) -- por ahora basta
  con poder leerlos; se vuelve su propia mini-fase si el volumen de
  reportes lo amerita.

## 4. Qué queda fuera de esta fase, a propósito

- **Reclutar y coordinar a los clientes de prueba**: es una decisión de
  negocio, no algo que yo pueda hacer -- esta fase deja lista la
  infraestructura (accesibilidad corregida, errores capturados, canal de
  feedback) para cuando tú decidas con quién y cuándo empezar.
- **Cumplimiento WCAG completo/certificación formal**: esta fase corrige
  los huecos concretos encontrados (foco, contraste, alt), no persigue
  una auditoría exhaustiva de cada criterio WCAG AA/AAA.
- **Herramienta de analítica de terceros** (Plausible, Umami, PostHog):
  se decidió reutilizar lo que ya existe en Supabase en vez de sumar
  infraestructura nueva -- se reconsidera si el volumen de datos o las
  necesidades de reporte superan lo que la tabla `events` puede dar.
- **Panel de triage de feedback**: los reportes quedan guardados y
  legibles, no gestionados con flujo propio todavía.

## 5. Checklist de verificación al terminar

Código completo y verificado localmente (`tsc --noEmit` limpio en
`packages/lib`, `apps/admin` y `apps/public`) -- falta desplegar al VPS y
verificar en vivo:

- [ ] Correr las 2 migraciones nuevas en el SQL Editor de Supabase, en
      orden: `20260912120001_client_error_event_type.sql`, luego
      `20260912120002_feedback.sql`.
- [ ] Actualizar los archivos de código en el VPS (ver el paquete
      entregado) y `docker compose -f infra/docker-compose.yml up -d --build`
      para ambos contenedores.
- [ ] Navegar el perfil público completo solo con teclado (Tab/Shift+Tab)
      y confirmar que siempre se ve claramente dónde está el foco.
- [ ] Revisar `/settings` en admin -- si algún theme existente tiene
      colores de bajo contraste, debe aparecer el badge "⚠ contraste bajo".
- [ ] Forzar un error en una página de cada app (ej. un `throw` temporal)
      y confirmar que `error.tsx` muestra algo razonable (no pantalla en
      blanco); en `apps/public` confirmar que además aparece en
      `docker logs reymen-public` vía `[client-error]` y como evento
      `client_error` en `/analytics`.
- [ ] Enviar un reporte desde `/feedback` en el perfil público y otro
      desde `/feedback` en admin, confirmar que ambos aparecen listados
      en `/feedback` del panel.
- [ ] `curl -I` a ambos dominios sigue mostrando los headers de Fase 16
      sin cambios (confirmar que esta fase no los rompe).

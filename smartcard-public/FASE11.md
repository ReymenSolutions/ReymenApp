# REYMEN SmartCard — Fase 11: `apps/public` (el landing real)

> Continúa de `FASE10.md` (Fase 10, ajustes). Este documento cubre la construcción real de `apps/public` -- hasta ahora era un scaffold de la Fase 3 con una sola página de debug. Esta fase agrega el landing público de verdad (`/{slug}`, `/n/{code}`, `/q/{code}`), la descarga de vCard, el tracking de clics sin JavaScript de cliente, y **sí trae una migración SQL nueva**.

## 1. Qué se construyó

- **`/{slug}`** -- el perfil digital de un cliente, con metadata real (`<title>`, `og:*`, `canonical`, `robots` según `is_noindex`) y un `profile_view` registrado en `events` en cada visita.
- **`/n/{code}` y `/q/{code}`** -- lo que de verdad lee una tarjeta NFC o un QR. Resuelven el código, registran el scan (`nfc_scan`/`qr_scan`), y:
  - si el destino es `PROFILE`, renderizan el mismo landing que `/{slug}` **en el propio `/n/{code}`** (sin redirigir a `/{slug}` -- ver sección 2) y registran también un `profile_view`.
  - si el destino es cualquier otro tipo (Google Reviews, WhatsApp, Maps, sitio web, URL personalizada), registran el evento correspondiente y redirigen de verdad (302) a la URL guardada en la tarjeta.
  - si la tarjeta está desactivada, muestra un mensaje amable ("esta tarjeta no está activa"), no un 404 -- la tarjeta existe, solo no está en uso.
- **Descarga de contacto** (`/api/vcard/{slug}`) -- genera un `.vcf` real (vCard 3.0) a partir de `get_vcard_data()` (Fase 2, ya existía sin usarse) y registra `save_contact`.
- **Clics rastreados sin JavaScript** (`/c/{slug}/{kind}`, `/l/{linkId}`) -- cada botón de contacto, red social y link del perfil apunta a una de estas dos rutas en vez de a un `href` directo. Ver sección 3.
- **Atribución de origen** (`?src=NFC`/`?src=QR`) -- un clic hecho dentro de la misma visita que llegó por `/n/` o `/q/` se sigue contando con ese origen en `events.source`, no cae a `DIRECT` solo porque el clic en sí es una petición nueva. Ver sección 4.
- **`packages/lib`** -- paquete compartido nuevo (`apps/admin` y `apps/public` lo usan los dos). Ver sección 5.

## 2. Por qué `/n/{code}` y `/q/{code}` no redirigen a `/{slug}`

`ARCHITECTURE.md` (sección 98, "rewrite vs. redirect para perfiles") ya dejaba esta decisión tomada desde el diseño original: un scan NFC/QR debe *mostrar* el perfil sin cambiar la URL visible del navegador -- el equivalente a un rewrite interno, no un redirect 302 a `/{slug}`. La razón es doble: evitar un round-trip extra en cada scan (más lento, y un salto visible si la conexión es mala), y evitar que el mismo contenido "viva" en dos URLs distintas a ojos de un buscador o de alguien que comparte el link. La implementación es literal: `/n/[code]/page.tsx` y `/q/[code]/page.tsx` llaman a la misma función (`resolveCardScan`) y renderizan el mismo componente (`ProfileView`) que `/{slug}/page.tsx`, solo que las tres rutas emiten su `<link rel="canonical">` apuntando siempre a `/{slug}` (`/[slug]/page.tsx` lo resuelve directo en su `generateMetadata`; `/n/[code]` y `/q/[code]` usan `buildCardScanMetadata()` en `lib/card-redirect.ts`, una función de solo lectura aparte de `resolveCardScan()` -- ésta sí registra eventos, y Next.js llama a `generateMetadata` como un paso separado del render de la página, así que reusar `resolveCardScan()` ahí habría duplicado cada `nfc_scan`/`qr_scan`/`profile_view`) -- así un buscador indexa una sola versión "oficial" aunque el contenido también sea accesible por el código de la tarjeta.

## 3. Por qué el tracking de clics no usa JavaScript de cliente

Todo el proyecto ya venía con esta postura (`ARCHITECTURE.md`, `CardDestinationFields.tsx` e `InviteFragmentHandler.tsx` son los únicos dos lugares con JS de cliente en todo el panel, y ambos por una razón puntual). Para un perfil público, la razón pesa todavía más: tiene que funcionar aunque el visitante tenga JavaScript desactivado, un navegador viejo, o esté abriendo el link desde el previsualizador de una app de mensajería (que a veces ejecuta la página sin que el usuario la "visite" de verdad -- ver sección 6, bots).

El mecanismo: en vez de que un botón de contacto tenga `href="tel:555..."` directo, tiene `href="/c/{slug}/call"`. Esa ruta (un Route Handler, no una página) hace tres cosas en el servidor, en orden: (1) busca el perfil, (2) resuelve el destino real a partir de sus propios datos (nunca de un parámetro que mande el cliente -- ver el párrafo de seguridad abajo), (3) llama a `log_event()` y (4) responde con un redirect 302 real al destino. El navegador sigue ese redirect solo, sin ningún script de por medio -- el clic quedó registrado antes de que el usuario llegue a WhatsApp, su correo, o donde sea.

**Por qué el destino nunca es un parámetro del cliente:** si `/c/{slug}/{kind}` aceptara la URL final como query param (`?to=https://...`), cualquiera podría armar un link `reymen.com/c/agente/call?to=https://sitio-malicioso.com` que la gente confundiría con un link legítimo del dominio -- un open redirect clásico. Por eso el destino *siempre* se recalcula del lado del servidor a partir de los propios campos del perfil (`profile.phone`, `profile.whatsapp`, etc.) o, para los links de la lista, de la fila real en `profile_links` vía la nueva función `get_link_for_redirect()` (sección 7) -- el cliente solo puede elegir *cuál* botón tocar, nunca *a dónde* va.

## 4. `tiktok`/`youtube` cuentan como `custom_link_click` -- limitación conocida

El enum de `events.event_type` (fijado en Fase 2) tiene un valor propio para cada red social que existía entonces (`instagram_click`, `facebook_click`, `linkedin_click`...), pero `tiktok` y `youtube` se agregaron a `profiles` después de esa fase y nunca se agregó su propio tipo de evento. `/c/{slug}/{kind}` los mapea a `custom_link_click` (el catch-all más cercano) en vez de fallar o inventar un valor nuevo del enum sin permiso. Si en algún momento hace falta distinguirlos de verdad en `/analytics`, el arreglo es una migración chica agregando `tiktok_click`/`youtube_click` al enum -- no se hizo aquí porque no fue pedido y toca un enum ya en uso.

## 5. El paquete nuevo `packages/lib`

Hasta Fase 10, la whitelist de tokens de theme (`layout`, `border_radius`, `font`, colores) vivía solo en `apps/admin/lib/theme-config.ts`, porque solo el panel la necesitaba (para el formulario de crear/editar themes). Esta fase agrega el primer lugar que necesita **leer** esos tokens para de verdad pintar algo (`apps/public`), así que la lógica se movió a un paquete compartido nuevo, `@reymen/lib`, con la misma estructura que `@reymen/database`:

- `theme-tokens.ts` -- exactamente lo que ya existía en `apps/admin/lib/theme-config.ts`, más una función nueva: `mergeThemeConfig(baseConfig, overrides)`, que resuelve los tokens finales de un perfil (los overrides de `profiles.theme_overrides` ganan campo por campo sobre el theme base, nunca lo reemplazan entero).
- `bot-detection.ts` -- `isBotUserAgent()`, una lista de patrones para crawlers y, sobre todo, los previsualizadores de links de apps de mensajería (WhatsApp, Telegram, Slack, Discord...) -- son la fuente de tráfico "falso" más común para un producto que la gente comparte por WhatsApp, y cada uno de esos golpes ya se registraba como un scan/view real sin este filtro.
- `device.ts` -- `detectDeviceType()`, una heurística simple por user-agent (`mobile`/`tablet`/`desktop`/`unknown`), sin depender de ninguna librería externa.
- `vcard.ts` -- `buildVCard()`, arma un archivo vCard 3.0 (se eligió 3.0 sobre 4.0 por compatibilidad más amplia con apps de contactos) con los saltos de línea CRLF que pide el formato y el escape correcto de `\`, `;`, `,` y saltos de línea.

`apps/admin/lib/theme-config.ts` **no se borró** -- se dejó como un re-export de una línea hacia `@reymen/lib/theme-tokens`, para no tener que tocar los 5 archivos de la Fase 10 que ya importaban de esa ruta. `apps/admin` se volvió a compilar completo después de este cambio (18 → 21 rutas, sin errores) para confirmar que no rompió nada.

## 6. Bots y crawlers no se descuentan de los conteos, solo se marcan

`events.is_bot` ya existía como columna desde Fase 2 (poblada, pero sin nada que la calculara). Esta fase la llena de verdad con `isBotUserAgent()`, pero **no** filtra esos eventos -- se siguen guardando igual, solo con `is_bot = true`. La razón: los conteos crudos de `/analytics` (Fase 8) siguen siendo el número real de peticiones, y filtrar en el momento de guardar habría sido una decisión sin vuelta atrás (el dato del user-agent original no se pierde, pero si el filtro estuviera mal calibrado, nunca lo sabrías). Excluir bots de las tarjetas de `/analytics` -- si en la práctica hace falta -- es un cambio de una sola condición en esas queries, no de esta fase.

## 7. La migración nueva: `20260909120001_public_profile_link_ids.sql`

Dos cambios, en el mismo archivo:

1. **`get_public_profile()` ahora incluye el `id` de cada link.** La versión original (Fase 2) devolvía `title/url/icon/type` por link, suficiente para pintarlos pero no para poder construir una ruta de clic sin exponer la URL de destino como parámetro (sección 3). Mismo cuerpo de la función, un campo agregado al `jsonb_build_object`.
2. **Función nueva `get_link_for_redirect(p_link_id uuid)`.** Hacía falta porque `profile_links` **nunca tuvo policy de SELECT para `anon`** (`rls_policies.sql`, Fase 2: solo SUPERADMIN/ADMIN/VIEWER autenticados pueden leerla) -- así que `/l/{linkId}` no puede hacer un `.from('profile_links').select(...)` directo como visitante anónimo, RLS lo filtraría en silencio. Esta función, `SECURITY DEFINER` igual que el resto de las funciones públicas del proyecto, resuelve la URL del link y el slug de su perfil dueño, confirmando además que ese perfil sigue `ACTIVE` y no borrado (si alguien desactivó el perfil después de compartir un link suyo, el link deja de funcionar en vez de seguir mandando a un perfil que ya no debería verse).

## 8. Qué queda fuera de esta fase, a propósito

- **Generación de código QR** -- las tarjetas ya guardan su `card_code`, pero no hay todavía nada que genere la imagen del QR a partir de él (ni en el panel, ni en `apps/public`). Es un candidato natural para agregarse a `packages/lib` cuando se pida.
- **Subida de fotos/logos a Storage** -- `profiles.photo_url`/`logo_url` siguen siendo campos de texto libre (una URL que ya exista en algún lado), no hay integración con Supabase Storage para subir el archivo directo desde el panel. `ProfileView` ya renderiza `photo_url`/`logo_url` si vienen llenos, así que en cuanto exista esa subida, se ve sin tocar `apps/public`.
- **Página 404 más elaborada** -- se agregó un `not-found.tsx` genérico (perfil/tarjeta/link que no existe cae ahí), pero no distingue el mensaje según qué faltó ni lleva ningún branding más allá del texto.
- **Excluir bots de `/analytics`** -- ver sección 6, ya queda el dato guardado (`is_bot`), falta decidir si de verdad hace falta filtrarlos ahí.
- **Recordar el tema/tipografía "Inter" declarado en `packages/lib`'s `FONT_OPTIONS`** -- `ProfileView` usa una pila de fuentes de sistema (`-apple-system, Segoe UI, Roboto...`) en vez de cargar Inter de Google Fonts. Se intentó cargarla con `next/font/google` primero, pero el build de este entorno no tiene salida a `fonts.googleapis.com` (bloqueado por política de red) -- y depender de esa descarga en build time es justo el tipo de cosa que también podría fallar en un pipeline de CI o una red corporativa restringida más adelante, así que se dejó fuera a propósito en vez de dejar un build frágil. La whitelist de `font` en `theme-tokens.ts` sigue teniendo `inter` como único valor -- si más adelante de verdad hace falta esa tipografía exacta, la forma robusta es autohospedar el archivo `.woff2` con `next/font/local` en vez de pedirlo a Google en cada build.

## 9. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase11-public.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- Instala dependencias (hay un paquete nuevo, `@reymen/lib`)

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm install
```

### Paso 3 -- Aplica la migración nueva

Esta fase sí trae una migración SQL nueva. Si tu Supabase local ya tiene datos que te importa conservar (clientes, perfiles, tarjetas de pruebas anteriores), **no** uses `stop`/`start` -- usa:

```powershell
npx supabase migration up
```

Confirma en la salida que menciona `20260909120001_public_profile_link_ids.sql`. Si prefieres partir de cero (pierdes los datos de prueba), `npx supabase stop` seguido de `npx supabase start` también la aplica.

### Paso 4 -- Arranca los dos apps

En dos terminales distintas:

```powershell
# Terminal 1 -- el panel, como siempre
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm run dev --workspace=apps/admin
```

```powershell
# Terminal 2 -- el sitio público, en el puerto 3000
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm run dev --workspace=apps/public
```

### Paso 5 -- Prueba el perfil por slug

1. En el panel (`127.0.0.1:3001`), entra a un perfil existente (o crea uno nuevo con teléfono, WhatsApp, correo, un link y una red social llenos) y anota su slug.
2. Abre `http://127.0.0.1:3000/{slug}` en el navegador -- debe verse el landing completo: hero con el color del theme, avatar (o iniciales si no hay foto), botones de contacto, "Guardar contacto", la lista de links, redes sociales y ubicación si el perfil las tiene.
3. Da clic en "Guardar contacto" -- debe descargar un `.vcf` que, al abrirlo, cree/actualice un contacto con los datos correctos.
4. Da clic en el botón de llamar/WhatsApp/correo -- debe abrir la app correspondiente (o mostrar el número/correo si no tienes esas apps configuradas en tu máquina).
5. Da clic en un link de la lista -- debe llevarte a la URL guardada de ese link.

### Paso 6 -- Prueba el scan de tarjeta

1. En el panel, busca (o crea) una tarjeta activa con destino `PROFILE` apuntando al perfil del paso anterior, y anota su `card_code`.
2. Abre `http://127.0.0.1:3000/n/{card_code}` -- debe verse el mismo landing que en el Paso 5, pero la URL del navegador se queda en `/n/{card_code}` (no salta a `/{slug}`).
3. Repite con `http://127.0.0.1:3000/q/{card_code}`.
3.1. Con "Ver código fuente de la página" (`Ctrl+U`) en `/n/{card_code}`, busca `<link rel="canonical"` -- debe apuntar a `http://127.0.0.1:3000/{slug}`, no a `/n/{card_code}` (sección 2).
4. Crea (o usa) una tarjeta con destino distinto a `PROFILE` (por ejemplo `MAPS` o `CUSTOM_URL` con una URL de prueba) y abre su `/n/{code}` -- debe redirigirte de verdad a esa URL externa.
5. Desactiva una tarjeta desde el panel y abre su `/n/{code}` -- debe mostrar el mensaje de "esta tarjeta no está activa", no un error ni el perfil.

### Paso 7 -- Confirma los eventos en `events`

```sql
select e.event_type, e.source, c.card_code, p.slug as profile_slug, e.link_id, e.is_bot, e.device_type, e.occurred_at
from events e
left join cards c on c.id = e.card_id
left join profiles p on p.id = e.profile_id
order by e.occurred_at desc
limit 30;
```

Después de los pasos 5 y 6 deberías ver, entre otras: `profile_view` (con `source = 'DIRECT'` del Paso 5, y `source = 'NFC'`/`'QR'` del Paso 6), `nfc_scan`/`qr_scan`, `save_contact`, `call_click`/`whatsapp_click`/`email_click`, `custom_link_click` (del link de la lista, con su `link_id` lleno).

### Paso 8 -- Confirma la atribución de origen dentro de la visita

1. Abre `/n/{card_code}` de un perfil (no `/{slug}` directo).
2. Desde ahí, da clic en el botón de WhatsApp.
3. En la consulta del paso 7, confirma que esa fila de `whatsapp_click` tiene `source = 'NFC'`, no `'DIRECT'` -- el clic "heredó" el origen del scan que lo trajo hasta ahí.

### Paso 9 -- Revisa `/analytics` en el panel

Con los eventos generados en los pasos anteriores, entra a `/analytics` (panel) y confirma que las tarjetas y gráficas ya reflejan actividad real, generada desde `apps/public`, no solo desde `log_event()` a mano por SQL como en la validación de Fase 8.

## 10. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/public` compila sin errores de TypeScript y genera las 8 rutas esperadas (`/`, `/[slug]`, `/api/vcard/[slug]`, `/c/[slug]/[kind]`, `/l/[linkId]`, `/n/[code]`, `/q/[code]`, más `/_not-found`).
- `npm run build --workspace=apps/admin` se volvió a correr después del refactor de `theme-config.ts` hacia `@reymen/lib` -- sigue compilando limpio, mismas 21 rutas de Fase 10.
- No se pudo correr esto contra un Supabase real, ni hacer un scan NFC/QR de verdad, desde este entorno -- pruébalo tú siguiendo la sección 9.

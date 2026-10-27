# REYMEN Ops Real Estate v1

> Nombre visible: **Real Estate** (antes "Realty"). En el código, rutas (`/portal/realty`), permisos y tablas se siguen llamando `realty` / `Realty*`.

Módulo `REALTY` (`/portal/realty`): **demanda + inventario + oportunidades** para
inmobiliarias. Es una capa vertical sobre el Core/CRM existente, **no** un CRM
nuevo: no tiene inbox, chatbot, pipeline genérico, tareas ni automatizaciones
propias, y no duplica contactos ni agenda.

## Qué reutiliza del Core (y qué no toca)

| Necesidad | Se resuelve con | Nota |
|---|---|---|
| Contacto del prospecto (nombre, teléfono, correo, estado) | `Lead` del CRM | `RealtyLeadProfile.leadId`. El adaptador `src/lib/realty/lead-adapter.ts` reutiliza el Lead si el teléfono o correo ya existe; si no, lo crea por el mismo camino que el CRM (tope del plan, `phoneKey`, enlace de conversaciones/clientes, auditoría, métrica). |
| Visitas | `Appointment` (Citas) | `RealtyPropertyVisit.appointmentId` (1–1). La visita aparece también en `/portal/appointments`. |
| Usuarios/asesores, sucursales | `User`, `Branch` | Solo referencias (`advisorUserId`, `branchId`). |
| Permisos | `src/lib/permissions.ts` | Nuevas acciones `realty:manage` (Dueño, Admin, Gerente) y `realty:operate` (+ Agente). Guards `requireRealtyManager` / `requireRealtyOperator` revisan permiso **y** módulo activo. |
| Auditoría, rate limit | `logAudit`, `checkRateLimit` | Toda mutación audita; los eventos públicos limitan por IP. |
| Oportunidades del pipeline | `Opportunity` (opcional) | `RealtyClosing.opportunityId` solo enlaza; Realty no mueve etapas. |

Interfaces y tablas del CRM **no cambian**: la migración solo agrega el valor
`REALTY` al enum `PlatformModule`, tablas `Realty*` nuevas y relaciones inversas.

## Modelo (migración `20261120090000_realty_v1`)

- `RealtySettings` — WhatsApp público y moneda por defecto.
- `RealtyZone` — zonas comerciales con punto **aproximado** (solo para el mapa).
- `RealtyLeadProfile` + `RealtyLeadZone` — qué busca el prospecto (operación, tipo, presupuesto, recámaras, baños, m², extras, zonas por prioridad).
- `RealtyProperty` (+ `Media`, `StatusHistory`, `Event`) — inventario, fotos, historial de estado y eventos de la landing.
- `RealtyMatch` — match guardado con desglose y `calculationVersion`.
- `RealtyCampaign` — campañas: el negocio captura solo el gasto, fechas, canal y propiedad; leads, visitas, cierres e ingreso se calculan solos (no es Ads Manager).
- `RealtyPropertyVisit`, `RealtyClosing` — visitas y cierres para analítica (no contratos ni facturación).

### Multi-tenant

Igual que el resto de ReymenApp (Next.js + Prisma + Postgres, no Supabase):
**aislamiento en la capa de aplicación**. Cada tabla tiene `organizationId`;
cada consulta filtra por la organización de la sesión y cada id que llega del
cliente (zona, sucursal, asesor, prospecto, propiedad, campaña, oportunidad)
se valida contra esa organización (`src/lib/realty/service.ts`). No hay RLS en
este repo; decisión documentada aquí. Pruebas: `src/lib/realty/service.test.ts`.

## Reglas (sin IA)

Ningún número sale de IA. Todo es SQL + funciones puras con pruebas.

### Match prospecto ↔ propiedad (`match.ts`, versión `v1`)

Operación distinta → no hay match. Si no, 0–100 ponderado:

| Componente | Peso | Regla |
|---|---|---|
| Presupuesto | 30 | Dentro del rango 100; arriba del máximo baja lineal a 0 al +20 %; abajo del mínimo baja hasta 50 (al −40 %), nunca menos de 50. |
| Zona | 25 | 1.ª prioridad 100, 2.ª 85, 3.ª+ 70, fuera 0; sin zonas elegidas 60. |
| Tipo | 15 | Igual 100; cercano (casa↔depa, oficina↔local, local↔bodega) 40; distinto 0; sin tipo 70. |
| Recámaras/baños | 15 | Promedio de lo pedido; −50 por unidad faltante; sin dato 50. |
| Superficie | 10 | ≥ mínimo 100; proporcional entre 60–100 %; < 60 % → 0. Terreno usa m² de terreno. |
| Extras | 5 | % de extras pedidos que tiene la propiedad. |

Si zona, tipo o presupuesto dan 0, el total se topa en **60** (abajo de "buen
match" = 65). Alto = 80+. Se recalcula al guardar prospecto/propiedad, al
cambiar estado y desde *Matches → Recalcular*. Solo se guardan matches ≥ 40.

### Market Pulse (`market.ts`) — "Demanda observada"

Solo prospectos activos e inventario propio; **no es dato de mercado externo**
(la UI lo dice). Oferta = propiedades `AVAILABLE` (apartadas, en negociación,
vendidas, rentadas e inactivas no cuentan).

- Lectura por segmento con muestra mínima 3: *alta demanda* (demanda ≥ 3 y ≥ 2× oferta), *sobreoferta* (oferta ≥ 3 y ≥ 2× demanda), *equilibrio*, *datos insuficientes*.
- Rangos de presupuesto (MXN) configurables por parámetro: venta < 2M, 2–4M, 4–6M, 6–10M, > 10M; renta < 15k, 15–25k, 25–40k, 40–60k, > 60k.
- Compra vs renta, tipos, extras más pedidos.
- **Zonas emergentes**: nuevos prospectos en el periodo vs el anterior de igual duración; cuentan con ≥ 3 en el periodo y crecimiento ≥ 50 % (o de 0 a ≥ 3).
- **Captación**: zona × operación × tipo × rango con ≥ 3 prospectos y oferta que les quepa ≤ ⅓ de esa demanda.

### Opportunity Score (`scores.ts`)

Propiedad (0–100): demanda en la zona 30 (prospectos/propiedad disponible; 2× = 100) · precio vs presupuestos 25 (% de esa demanda a la que le cabe) · interés en la landing 20 (puntos: vista 1, compartir 2, WhatsApp 4, agendar 5; relativo a la de más interés) · tiempo en inventario 15 (≤ 30 días 100 → 0 a los 180) · competencia interna 10 (−25 por cada propiedad igual a ±20 % del precio).

Zona (0–100): presión de demanda 40 · crecimiento 25 · interés 20 · demanda sin atender 15.

- **Impulsar**: disponible, score ≥ 65, demanda en zona ≥ 50 y precio vs presupuestos ≥ 30.
- **Estancada**: abierta, ≥ 60 días, < 15 puntos de interés en 30 días y sin visitas en 30 días.
- **Price Insight**: mediana de comparables propios (misma zona, operación y tipo; incluye vendidas/rentadas; precio/m² si hay área suficiente). < 3 comparables → "muestra insuficiente"; ±10 % = "en rango". Siempre con el aviso **"Insight basado en datos internos."** No es avalúo.

### Campañas (`campaigns.ts`, `campaign-stats.ts`)

**Métricas automáticas.** Nadie captura conteos. Cada campaña tiene un **enlace de seguimiento**
(`/p/<slug>?src=<canal>&c=<id>`, botón «Copiar enlace» en Campañas) que se usa en el anuncio. Quien llena
«Quiero informes» desde ese enlace queda con `RealtyLeadProfile.campaignId` (el **primer contacto manda**; solo
si la campaña es de la misma organización). A partir de ahí:

- **Leads** = perfiles con esa campaña.
- **Visitas** = visitas no canceladas de esos prospectos (ligadas al perfil, o agendadas desde la landing con el mismo contacto del CRM).
- **Cierres e ingreso** = cierres registrados de esos prospectos (suma del monto final).

Una campaña cuyo enlace no se usa muestra ceros. Las columnas `leadsCount`, `visitsCount`, `closingsCount` y
`attributedRevenue` de `RealtyCampaign` quedaron sin uso (no se borraron para no destruir datos).

Fórmulas: CPL, costo por visita, costo por cierre, ROI = (ingreso − gasto)/gasto,
conversión lead→visita y visita→cierre. Sin denominador → `null` ("—"), nunca
Infinity/NaN. Lectura: sin gasto *sin datos*; gasto sin leads o CPL ≥ 1.5× la
mediana *deficiente*; ROI ≥ 100 % o CPL ≤ 0.8× mediana *eficiente*. El ROI
total usa el ingreso conocido contra todo el gasto (conservador).

### Qué hacer hoy (`today.ts`)

Recomendaciones con `type, priority, title, explanation, evidence, entityType,
entityId, actionLabel, href`: confirmar visitas próximas (≤ 36 h), mostrar
matches altos sin visita, captar, impulsar, revisar estancadas, revisar
campañas deficientes, prospectos sin inventario. Máximo 3 por tipo.

## Landing pública y SmartCard

`/p/<slug>` (sin sesión, en `src/proxy.ts`): mobile-first, fotos, precio,
características y CTAs **WhatsApp / Agendar visita (crea una cita en Citas) / Compartir**.
Nunca muestra dirección exacta salvo `showExactLocation`; sin datos internos.
Solo propiedades publicadas, no inactivas, de organizaciones activas con el
módulo activo.

Eventos (`POST /api/realty/public/events`, `sendBeacon`): `property_view`,
`whatsapp_click`, `schedule_click`, `share_click`, con origen `?src=` (p. ej.
`smartcard`, `qr`, `meta`) y campaña `?c=<id>` (solo si es de la misma
organización). Sin IP ni datos personales: hash diario del visitante; una
vista por visitante y día; 60 eventos/min por IP.

**SmartCard sin duplicar**: la ficha de la propiedad da el enlace
`/p/<slug>?src=smartcard`, su QR y un acceso a `/portal/smartcard` (si el
módulo NFC_QR está activo). El enlace se pega en la SmartCard existente; no se
crea otra tarjeta ni se toca Supabase.

## Landing pública rediseñada (`/p/<slug>`)

Mobile-first, con la identidad de Reymen: encabezado azul noche, galería con deslizado y contador, precio y datos clave,
y una **tarjeta de acciones** con pestañas **«Agendar visita»** y **«Pedir informes»**, WhatsApp directo y compartir (fija a
la derecha en pantallas grandes; en el celular, justo después de los datos y con una barra fija abajo).

- **Modo oscuro legible**: la landing usa tokens propios `--rl-*` (`src/app/globals.css`, clase `.rl`, claro y oscuro) en vez
  de colores fijos. Antes los textos de color fijo (negro) quedaban sobre fondos que sí se oscurecían con el remapeo global
  de `.dark`.
- **Idioma y tema** (selectores en el encabezado): se guardan en las cookies `reymen-lang` / `reymen-theme` que lee el
  servidor (y en la cuenta si hay sesión), así que se conservan al recargar. Al cambiar de idioma se vuelve a pedir la página.
- **Placeholders, no texto por defecto**: los campos de texto salen vacíos con un ejemplo («Ej. María López», «Ej. 4,500,000»…).
  Solo las listas (compra/renta y tipo) arrancan con lo de la propiedad.

### Agendar visita → Citas

`GET /api/realty/public/visit-slots?slug=&date=` y `POST /api/realty/public/visits` (`src/lib/realty/visit-request.ts`):

- Horarios = reglas de la **Agenda** del negocio (`AvailabilityRule`) en su zona horaria; sin reglas, lunes a sábado de 9 a 18 h.
  Visitas de 60 min, 2 h de anticipación mínima, hasta 30 días, y se quitan los horarios ya apartados de esa propiedad o de
  su asesor. El servidor vuelve a validar que el horario elegido siga libre (no confía en el cliente).
- Crea el **Lead** del CRM (mismo teléfono = mismo contacto) y la visita con `scheduleVisit`: un `Appointment` de Citas
  (estado «Programada» = por confirmar, origen `realty-landing`) + `RealtyPropertyVisit` (aparece en Real Estate → Visitas y en
  `/portal/appointments`, y entra a los recordatorios de citas). Si el tope de leads del plan está lleno, la cita se agenda
  igual con el contacto en la descripción. Avisa por correo al asesor.
- Mismo origen, 6 solicitudes/hora por IP (60 consultas de horarios/min), campo trampa; responde códigos.

## Formulario «Quiero informes» (captura de demanda)

En `/p/<slug>`, arriba de los botones de WhatsApp, la persona deja **WhatsApp, compra/renta, tipo, presupuesto («hasta
cuánto») y colonia o CP**. Llega precargado con lo de la propiedad (operación, tipo, precio redondeado hacia arriba,
colonia); la persona ajusta lo que busca. El formulario **no bloquea** los botones de WhatsApp.

`POST /api/realty/public/inquiries` (sin sesión, `src/lib/realty/inquiry.ts`):

- Solo mismo origen, 6 intentos/hora por IP, campo trampa; responde **códigos** (`phone_invalid`, `postal_not_found`,
  `postal_ambiguous`, `place_invalid`, `unavailable`, `rate_limited`), no textos. Organización, asesor y sucursal salen de
  la propiedad, nunca del cliente.
- Crea/reutiliza el **Lead** del CRM (`ensureLeadForProspect`: mismo teléfono = mismo contacto; etiqueta `realty`; asignado
  al asesor de la propiedad si no tenía) y el **perfil de búsqueda** con `saveProspect` (zonas, matches, auditoría sin
  usuario). El tope de leads del plan no rompe el formulario: responde `saved: false` y la persona sigue a WhatsApp.
- **Sin duplicar demanda**: quien vuelve a llenarlo con la misma operación actualiza su perfil (último presupuesto, zonas
  sumadas, máx. 5) y conserva lo que un asesor capturó a mano (recámaras, extras…); otra operación = otro perfil.
- **Colonia o CP**: texto = colonia (si es la de la propiedad usa su CP y cae en su misma zona); 5 dígitos = CP: usa las
  zonas que la organización ya tiene en ese CP; si no hay, crea las colonias del CP (≤ 3); con más o inexistente pide la colonia.
- Guarda `sourcePropertyId` (de qué landing llegó), consentimiento (`consentVersion`, `consentAt`), origen
  `landing[:src]`, el evento `INQUIRY` (cuenta en «Interés» de la propiedad) y avisa por correo al asesor (o, sin asesor,
  a dueño/admin/gerente). El mensaje de WhatsApp posterior lleva el título y el **folio** (slug) de la propiedad.

Pruebas: `inquiry.test.ts`, `route.test.ts` y `InquiryForm.test.tsx`.

## «Lo que busca» en el CRM

En la ficha del contacto (`/portal/leads/<id>`) y en su panel lateral, si la organización tiene el módulo REALTY, aparece la
tarjeta **«Lo que busca»** (`src/lib/realty/lead-profile.ts` + `LeadSearchProfiles`): compra/renta, tipo, presupuesto, colonias,
mejor match, propiedad de la que llegó y enlace al prospecto (máx. 3 perfiles, el activo primero). Sin perfil, explica qué falta y
ofrece **«Agregar lo que busca»** (con `realty:operate`), que abre `/portal/realty/prospects/new?leadId=…` con el contacto ya
elegido (solo si es de la organización). En **Contactos** hay el filtro **«Con perfil inmobiliario»** (`?realty=1`). Sin el módulo
no se muestra nada: el CRM no conoce el modelo de Real Estate más allá de esta tarjeta.

## La IA propone el perfil de búsqueda

Guía para probarla con conversaciones reales: [`realty-ia-prueba.md`](./realty-ia-prueba.md).

Cuando la organización tiene Real Estate, el Agente IA del pipeline (`src/lib/ai-pipeline.ts`) agrega al **mismo** análisis de la conversación un objeto `search_profile` (compra/renta, tipo, presupuesto, colonias, recámaras, extras). No hay una segunda llamada al modelo, así que respeta el presupuesto de IA, el modo del canal (Apagado = nada) y el enfriamiento entre análisis.

- Solo se propone si el cliente dijo **compra/renta y presupuesto**; si falta algo, no se propone nada.
- La propuesta se guarda en `RealtyProfileSuggestion` (`src/lib/realty/profile-suggestion.ts`) y aparece en «Lo que busca» del contacto (ficha y panel) con **Aceptar** (crea el perfil, con las colonias que ya existen), **Editar** (abre el formulario de prospecto prellenado) y **Descartar**.
- **Nunca se crea un perfil solo.** No se propone si el contacto ya tiene un perfil activo o una propuesta pendiente, y tras descartar no vuelve a proponer durante 30 días.
- Si alguien crea el perfil a mano, la propuesta pendiente de ese contacto queda resuelta.

## Rotación (`/portal/realty/rotation`)

Responde «qué casas sí se mueven, cuáles no y por qué». Código puro en `src/lib/realty/rotation.ts`, insumos en `rotation-data.ts`.

- **Días en mercado**: de `availableSince` al último cambio a Vendida/Rentada en el historial de estados (si no hay historial, la fecha del cierre registrado). Solo cuentan las cerradas dentro del periodo elegido.
- **Agrupaciones**: zona, tipo, rango de precio, **asesor** (el de la propiedad; incluye su inventario abierto) y **canal** (el origen del prospecto que cerró, p. ej. `landing · smartcard`; solo se conoce al cerrar, así que no hay inventario abierto por canal).
- **Lectura**: rápida ≤ 30 días, lenta ≥ 90, normal en medio. Un segmento (zona, tipo, rango de precio) necesita al menos 3 cierres (`MIN_SAMPLE`) para opinar; si no, «Datos insuficientes».
- **Sell-through**: cerradas ÷ (cerradas + inventario abierto).
- **Rápidas vs. lentas**: compara precio contra la mediana comparable (misma operación y tipo), interés (WhatsApp, agendar, compartir) y fotos. Solo redacta un hallazgo si hay 3 rápidas y 3 lentas y la diferencia es relevante (precio ±5 puntos, interés ±30 %, fotos ±2). Son datos internos, no de mercado, y la página lo dice.
- **Demanda sin cubrir**: zonas pedidas por ≥ 3 prospectos activos cuyo mejor match es menor a 65.
- Sin IA: todo son conteos y medianas.

## Ubicación sin capturar coordenadas

En la propiedad y en las zonas nadie escribe latitud/longitud ni tiene que
adivinar el formato de una dirección. El formulario va por partes:

1. **Código postal** (5 dígitos). Con el CP se llenan solos el municipio y el
   estado, y aparecen las colonias de ese CP (catálogo oficial de SEPOMEX,
   empaquetado en `@webrek/mx-cp`, MIT: sin API ni llave; `src/lib/realty/postal.ts`).
2. **Colonia**, elegida de la lista (o "Otra" para escribirla). Si el CP no está
   en el catálogo, se escriben colonia, municipio y estado a mano.
3. **Calle y número** (solo propiedades; es interno salvo que se active la
   ubicación exacta en la landing).

**La zona es la colonia.** La propiedad no tiene selector de zona: al guardar
se asigna la zona de su colonia (colonia + CP) y, si no existe, se crea sola
(`ensureColoniaZone` en `src/lib/realty/service.ts`); su punto aproximado para
el mapa se calcula **solo** en segundo plano por colonia y CP (`src/lib/realty/zone-geo.ts`).
Las zonas que se guardan sin punto (a mano o de antes) también se ubican solas: Mercado y
Configuración completan unas cuantas por visita (`scheduleZoneBackfill`). Un punto puesto a
mano nunca se sobrescribe. Colonias con el mismo
nombre en otro CP son zonas distintas ("Centro (San Pedro Garza García)"). En
el prospecto, las colonias de interés se eligen de las existentes o se agregan
por CP. Market Pulse solo lista colonias con demanda u oferta. Si una colonia todavía no tiene punto en el mapa (la búsqueda falló), se dibuja en el centro de sus propiedades redondeado a ~1 km. Una propiedad de
antes sin colonia conserva la zona que tenía.

**Buscar en el mapa** usa esas partes, de lo más fino a lo más general: la casa
(búsqueda estructurada y luego texto), la colonia, el CP y el municipio. Si no
encontró la casa exacta lo dice ("ubicamos la colonia; mueve el pin a la casa").
La persona **confirma** el pin (o lo arrastra / da clic en el mapa) antes de
guardar; mientras hay un pin sin confirmar, el formulario no se guarda. Si no
hay resultados, se ubica a mano.

La búsqueda corre en el servidor (`src/lib/realty/geocode.ts`) contra
Nominatim de OpenStreetMap, respetando su
[política de uso](https://operations.osmfoundation.org/policies/nominatim/):
1 petición por segundo para toda la app, User-Agent propio, caché de 24 h,
sin autocompletar (solo al dar clic) y atribución en pantalla. Variables
opcionales:

- `GEOCODER_DISABLED=1` — apaga la búsqueda sin desplegar (queda ubicar a mano).
- `GEOCODER_URL` (+ `GEOCODER_KEY`) — otro servicio compatible con la API de
  Nominatim (una instancia propia o un proveedor comercial). Recomendado si el uso
  crece: el servicio público puede limitarse o retirarse sin aviso.
- `GEOCODER_COUNTRY` — países donde buscar (por omisión `mx`).

La dirección que se busca se envía a ese servicio externo; no se envía ningún
dato de prospectos.

## Fotos

Se reducen en el navegador (≤ 1600 px) y el servidor las re-codifica con
`sharp` a WebP sin EXIF (quita GPS) y las guarda en la base
(`RealtyPropertyMedia.data`). Límite: 12 fotos por propiedad (≈ 150–300 KB cada una).

**¿Hace falta un CDN?** No como servicio aparte, pero la ruta ya está hecha para uno:
`/api/realty/media/<id>` responde con `Cache-Control: public, max-age=31536000, immutable`
y `ETag` (el id cambia si la foto cambia), así que cualquier CDN o proxy delante
(Cloudflare, o `proxy_cache` de nginx) la guarda sola y la base solo se lee en el primer
pedido; un navegador que revalida recibe `304` sin que se lean los bytes. Las fotos de
propiedades no publicadas llevan `private` y nunca se cachean en un CDN.

Para la v1 no se agregó almacenamiento de objetos (S3/R2): el repo no tiene ninguno y sería
infraestructura nueva. Conviene migrar cuando las fotos pasen de unos pocos GB (cada
respaldo de la base las incluye): solo cambian `src/lib/realty/media.ts` y esa ruta.

## Demo

```bash
ALLOW_REALTY_DEMO_SEED=reymen-realty-demo npx tsx prisma/seed-realty-demo.ts
```

Solo desarrollo (se bloquea en producción y si la org demo tiene datos ajenos).
Crea "REYMEN Realty Demo" (Monterrey: Cumbres, Valle Poniente, San Pedro,
Carretera Nacional, Mitras, Apodaca; coordenadas aproximadas), asesores,
prospectos (Leads del CRM), propiedades con fotos de muestra generadas,
eventos, visitas, cierres y campañas. Escenarios: San Pedro alta demanda /
poca oferta (captación), Apodaca sobreoferta, Mitras Centro estancada,
Cumbres Elite para impulsar con match alto (Ana Martínez), Carretera Nacional
emergente, campañas eficientes y deficientes.

Usuarios: `demo@realty.test` (dueño), `mariana@realty.test` (gerente),
`laura@realty.test` / `diego@realty.test` (asesores) · `RealtyDemo2026!`.

## Fuera de alcance v1

CRM nuevo, inbox, chatbot, pipeline/tareas/automatizaciones propias, Ads
Manager o conexión a plataformas de anuncios, scraping, MLS, contratos,
facturación, avalúos, datos de mercado externos, exportar CSV.

## Limitaciones conocidas

- Coordenadas de zona aproximadas, calculadas solas por colonia y CP (a nivel colonia, no de calle).
- Fotos en la base: cacheables por CDN (ver Fotos); sin almacenamiento de objetos todavía.
- Campañas: solo cuentan el tráfico que llega por su enlace de seguimiento; lo que entra sin `?c=` (p. ej. un anuncio sin el enlace) no se atribuye.

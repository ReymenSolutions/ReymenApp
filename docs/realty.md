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
- `RealtyCampaign` — registro manual de campañas (no es Ads Manager).
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

### Campañas (`campaigns.ts`)

CPL, costo por visita, costo por cierre, ROI = (ingreso − gasto)/gasto,
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
características y CTAs **WhatsApp / Agendar (por WhatsApp) / Compartir**.
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

En zonas, el nombre se llena con la colonia (se puede cambiar) y se guarda el
CP. En propiedades se guardan `postalCode`, `neighborhood` (colonia),
`municipality`, `state` y `addressLine`, y la zona se propone sola cuando la
colonia o el CP coinciden con una zona existente.

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
(`RealtyPropertyMedia.data`). Se sirven por `/api/realty/media/<id>` con caché
larga si la propiedad es pública; si no, solo a usuarios de la organización.
Límite: 12 fotos por propiedad. Cuando el repo tenga almacenamiento de
objetos, solo cambia `src/lib/realty/media.ts` y esa ruta.

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

- Coordenadas de zona aproximadas, capturadas por el negocio.
- Fotos en la base (sin CDN) — suficiente para v1.
- Agendar desde la landing abre WhatsApp (no crea cita automática).
- Campañas con conteos manuales.

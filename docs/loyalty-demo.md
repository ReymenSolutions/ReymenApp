# REYMEN Loyalty — demo (branch `feature/food-loyalty-demo`)

> “Convierte cada visita en información comercial.” Lealtad por visitas como
> módulo propio de la plataforma (`LOYALTY`), con mapa e inteligencia por código postal.

Esta branch es una **demo evaluable**: no se ha integrado a `main`.

## Cómo verla

```bash
npm install                        # agrega leaflet (mapa)
npx prisma migrate deploy          # migraciones 20261023… (tablas), 20261024… (módulo) y 20261025… (ubicaciones/POS)
npx tsx prisma/seed-loyalty-demo.ts
npm run dev
```

- Dueña: `demo@cafenorte.test` · Caja (rol Agente): `caja@cafenorte.test` · contraseña `CafeNorte2026!`
- Panel: sección **Lealtad** del menú lateral (`/portal/loyalty`): Resumen, Programa, Clientes, Visitas, Mapa y Analytics
- Inscripción pública: `/lealtad/cafe-norte-demo` (y `?suc=<id>` por sucursal)

Escenarios sembrados: **Mariana López** 6/10 (caso 6 → 7), **Juan Pérez** 9/10
(llega a 10/10 y desbloquea la recompensa) y **Sofía Ramírez** con una
recompensa disponible (canje). El seed es idempotente: borra y regenera solo los
datos de lealtad y las ventas `Demo lealtad` de `cafe-norte-demo`.

## Rutas

| Ruta | Qué es |
|---|---|
| `/portal/loyalty` | Resumen: KPIs, mapa, oportunidades, actividad, top CP, recompensas |
| `/portal/loyalty/program` | Configuración del programa, enlace público y QR (general y por sucursal) |
| `/portal/loyalty/members` | Tabla filtrable (CP, estado, progreso, recompensa, sucursal) |
| `/portal/loyalty/members/[id]` | Perfil: progreso, venta acumulada, ticket, historial, recompensas, tarjeta |
| `/portal/loyalty/visits` | Caja: identificar (QR/código/búsqueda) → confirmar → monto → registrar; canje |
| `/portal/loyalty/map` | Mapa por CP con capas (clientes, ventas, participación, ticket, frecuencia) |
| `/portal/loyalty/analytics` | Series, ranking por CP, recompensas, actividad y segmentos |
| `/lealtad/[slug]` | Inscripción pública (nombre, WhatsApp, CP; correo opcional) |
| `/lealtad/[slug]/tarjeta/[token]` | Tarjeta del cliente con QR (pública, `noindex`) |
| `/lealtad/[slug]/tarjeta/[token]/wallet/{apple,google}` | 501 hasta conectar credenciales |

## Modelo (Prisma, migración `20261023090000_food_loyalty_demo`)

`LoyaltyProgram` → `LoyaltyProgramVersion` (la regla; nunca se edita, se crea la
siguiente) → `LoyaltyMember` → `LoyaltyVisit` / `LoyaltyReward`.

- **Ciclo**: `src/lib/loyalty/cycle.ts` es la única regla (caja, tarjeta, seed y pruebas).
- **Recompensas**: snapshot de meta/recompensa/versión; único `(memberId, cycleNumber)`.
- **Visitas**: único `(organizationId, idempotencyKey)`; registro en transacción con
  `SELECT … FOR UPDATE` sobre el miembro + enfriamiento de 3 min contra duplicados.
- **Canje**: `updateMany … where status = AVAILABLE` (atómico, una sola vez).
- **Historial**: nada se borra; las visitas tienen `status` para ajustes futuros.

## Decisiones de arquitectura

- **Prisma + Postgres, no Supabase.** ReymenApp no usa Supabase como base propia
  (Supabase solo es el proyecto aparte de SmartCard). Se siguió la arquitectura
  real: modelos Prisma + migración SQL versionada. No se agregó otra capa.
- **Aislamiento multi-tenant en la capa de datos, no RLS.** El repo no usa RLS
  (un solo rol de base vía Prisma). Cada consulta recibe el `organizationId` de
  la sesión (o resuelto desde el slug público) y lo incluye en el `where`; un id
  o token de otra organización "no existe". Hay pruebas de esto.
- **Clientes**: cada miembro se enlaza al `Customer` existente (mismo teléfono),
  no se duplica la entidad. La inscripción no emite `customer.created` para no
  disparar automatizaciones reales desde una demo.
- **Ventas**: la visita guarda `saleAmount` y un `saleId` opcional a `FoodSale`,
  desacoplado: no crea ventas ni toca las estadísticas del POS. La participación
  Loyalty compara contra la suma de `FoodSale` del periodo.
- **Módulo propio**: `PlatformModule.LOYALTY` (se activa por organización desde el
  admin, como cualquier módulo). No depende de `FOOD_OPS`; si el negocio también
  tiene Food, la participación sobre ventas totales usa `FoodSale`. Permisos:
  `loyalty:manage` (configurar) y `loyalty:operate` (caja).
- **Sucursal**: `branchId = null` es la Principal implícita, igual que Food.
- **Mapa**: Leaflet sobre teselas de OpenStreetMap (sin llave). Agrega por CP;
  nunca domicilios. El mapa base es real; el punto de cada CP de la demo es
  **aproximado** (`postal-zones.ts`, km desde la sucursal) porque falta un
  catálogo real de centroides/polígonos (SEPOMEX/INEGI). Para producción con
  tráfico conviene un proveedor de teselas con plan: `NEXT_PUBLIC_MAP_TILE_URL`
  (su host entra solo a la CSP).
- **Insights**: reglas explícitas en `metrics.ts` (no IA ni modelos predictivos).
- **Permisos**: ver Lealtad = módulo LOYALTY; configurar = `loyalty:manage`;
  registrar visitas y canjear = `loyalty:operate` (incluye al Agente/caja).

## Ubicación de las sucursales

En **Programa → Ubicación de las sucursales** el negocio escribe el CP de cada
punto de venta (Principal y sucursales) y marca el pin en el mapa
(`LoyaltyLocation`, un renglón por sucursal; `branchKey = "main"` para la
Principal). El mapa se centra en la sucursal del filtro y las distancias de
cada CP se miden al punto de venta ubicado más cercano. Sin ninguna ubicación,
el mapa se centra en Monterrey y no hay distancias ni "zonas de oportunidad".

## Reymen POS

La venta del POS registra la visita sola: ver `docs/loyalty-pos.md` (guía para
el lado del POS) y `src/lib/loyalty/pos.ts`. Consulta firmada en
`POST /api/webhooks/pos/loyalty`; la orden de siempre
(`POST /api/webhooks/pos/orders`) acepta un bloque `loyalty` y responde con el
progreso. La visita se crea en la misma transacción que la `FoodSale` (ligada
por `saleId`, llave `pos:<orderId>`), y una cancelación la anula sin borrarla.

## Wallet

**Pendiente por credenciales.** No hay certificados de Apple ni cuenta emisora
de Google en el proyecto, así que no se simula una integración: los botones se
muestran deshabilitados con el aviso "Próximamente", las rutas responden 501, y
`buildWalletCard()` ya define el contenido del pase. Variables a configurar:
ver `.env.example` y `src/lib/loyalty/wallet.ts`.

## Limitaciones conocidas

- Solo mecánica por visitas (el enum `LoyaltyRuleType` deja abierta la puerta a gasto/puntos).
- Un programa activo por organización en la UI (el modelo admite más).
- Escaneo con cámara solo donde el navegador tiene `BarcodeDetector` (Chrome/Android);
  en otros, lector USB o pegar el enlace.
- Segmentos y campañas: solo consulta; no hay envíos.
- Segmentación en memoria sobre columnas compactas: suficiente para miles de
  miembros; para decenas de miles, mover a una vista materializada.

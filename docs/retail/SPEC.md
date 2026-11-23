# Reymen Retail — Spec del módulo (Grupo Carvallo)

**Decisión confirmada 23 nov 2026:** se construye dentro de Reymen App, como un módulo más. No es una aplicación aparte, no es un sistema aparte por tienda.

**Piloto:** Grupo Carvallo, Monterrey, N.L. — Labash, Outlet del Norte y Casa Carballo.
**Estado:** Spec para desarrollo con Codex (módulo) y Claude Code (web pública). Sin código todavía.
**Fecha del spec:** 23 nov 2026. Fuente: ideas-v2-BORRADOR.md + sesión con el cliente del 23 nov (9 puntos) + decisiones 23 nov.

## El grupo — 3 negocios, no 4

| Negocio | Formato | Estado |
|---|---|---|
| Labash | Ropa premium: vestidos, camisas, tacones, tenis, joyería | Activa — piloto |
| Outlet del Norte | Ropa casual, saldos / defectos leves, ej. $79 | Activa — piloto |
| Casa Carballo | Hogar: colchas, electrodomésticos (estufas NO confirmadas, no afirmar) | INACTIVA, posible reapertura. Lista para activarse, fuera del piloto |

Corrección 18 nov 2026 (Reynol): **Las Misiones NO existe como tienda.** No es una 4ª tienda. El mayoreo por pallet es un módulo, no una tienda. No inventar una 4ª ubicación, ni una página de Facebook para ella.

Dueño: un solo dueño para los 3 negocios. Es vendedor, le gustan las propuestas, no está enfocado en el back-office. Contacto vía Emi / Enrique. No hay nombre del dueño ni WhatsApp directo registrado en este spec — no inventarlo.

## Qué duele hoy (confirmado)

- Ventas por WhatsApp manual: fotos, "yo la quiero", muchas preguntas, historias.
- Descuentos semanales que cambian: ej. 70% Labash, 60% efectivo / 50% tarjeta.
- Sin inventario detallado: solo 6 departamentos en el POS actual, piezas mal clasificadas (ej. piezas de $79 registradas como ropa interior), no sabe qué marca/talla/color/estilo vende.
- Doble venta: misma pieza vendida en línea y en físico.
- Personal de redes sociales contratado antes no funcionó.
- Ropa toda nueva salvo defecto raro de cierre/botón. Doble etiqueta: marca + etiqueta propia de la tienda.

## Qué resuelve el módulo

- Cada prenda tiene **un código único con QR**. Sin código, no se vende, no se aparta, no se mueve.
- Una venta baja la pieza en todos los canales a la vez: POS, WhatsApp y web. No hay doble venta.
- Cada movimiento queda registrado: quién, cuándo, de dónde a dónde.
- Cada venta registra **quién la hizo (vendedor)**.
- El dueño ve en una pantalla venta del día, margen bruto comercial y contribución operativa por prenda (no utilidad neta) y margen bruto por descuentos, por tienda y consolidado.
- Todo en una plataforma, empezando con los 3 negocios actuales, preparada para nuevas sucursales y negocios a futuro.

## Decisión POS — cerrada 23 nov 2026

**Nosotros le hacemos el POS: POS Reymen.**
- Variante elegida: **sin facturación inicial, lista para agregarla después.**
- NO con proveedor externo de CFDI desde el inicio. NO mantener GESEM como POS principal.
- GESEM queda solo como origen para migrar/exportar catálogo, clientes e historial (por Excel, por lotes). No hay integración en vivo con GESEM: no tiene API pública documentada, y la exportación a Excel de ventas/inventario no está documentada públicamente (el dueño dice que su GESEM sí exporta, alcance por verificar).
- Facturación: en el MVP no hay CFDI timbrado. El módulo guarda precio, costo y descuento separados y deja el gancho listo para un proveedor externo de CFDI en fase siguiente. No prometer timbrado en el MVP. Si un cliente pide factura en el MVP, se registra "factura solicitada" y se factura fuera del módulo.

## Arquitectura en Reymen App — patrón Realty / Contractors / Talleres

Verificado en repo 23 nov 2026 (ReymenSolutions/ReymenApp, commit 780430b, Next.js 15, Prisma, PostgreSQL, Tailwind, multi-tenant; schema.prisma ya tiene 3,749 líneas):

- Módulos viven en el enum Prisma `PlatformModule` en `prisma/schema.prisma:1345` y en `src/lib/modules.ts` (CRM, AI_WHATSAPP, AUTOMATIONS, NFC_QR, MARKETING_ADS, FOOD_OPS, REYMEN_POS, LOYALTY, REALTY). No existe aún un módulo RETAIL.
- **Agregar `RETAIL` al enum y registrarlo en `src/lib/modules.ts`**, siguiendo REALTY. Reutilizar los módulos que ya existen, no duplicarlos:
  - `REYMEN_POS` — CORRECCIÓN 23 nov: NO es una interfaz de POS dentro de Reymen App. Es un permiso para recibir ventas de un POS externo por webhook (`src/app/api/webhooks/pos/orders/route.ts`, `processFoodPosOrder` en `src/lib/food.ts`, con `prisma.$transaction` e idempotencia por id de orden). La interfaz de POS para retail (escaneo QR, vendedor, corte) SÍ hay que construirla nueva dentro de RETAIL, reutilizando el patrón de venta transaccional de Food, no inventando otro.
  - `FOOD_OPS` — patrón reutilizable, no modelo directo: `Branch` (sucursales), `FoodInventoryItem` + `FoodInventoryMovement` (existencias por sucursal), `FoodSale` (sucursal, descuento, cancelación, canal). Pero es inventario por cantidad, NO por pieza única: Retail necesita su propio `RetailItem` (una fila = una prenda, código único + QR).
  - `CRM` — clientes y leads. Retail no crea su propia tabla de personas.
  - `LOYALTY` — programa de lealtad real (programas, miembros, visitas, recompensas), Fase 2/3.
  - `AI_WHATSAPP` — agente WhatsApp real, Fase 2/3.
  - `MARKETING_ADS` y `NFC_QR` — CORRECCIÓN 23 nov: en el enum están marcados como reservados, "no schema/UI yet" (`prisma/schema.prisma:1349-1350`). NO existen todavía: el asistente de Meta Ads y las etiquetas QR hay que construirlos, no asumir que ya están.
- Entitlement por organización vía `OrganizationModule`. Guardar todas las rutas y server actions con `requireModule(orgId, "RETAIL")`.
- Entitlement por organización vía `OrganizationModule`. Guardar todas las rutas y server actions con `requireModule(orgId, "RETAIL")`.
- Ruta: `/portal/retail` con pestañas: Panel, POS, Inventario, Movimientos, Mayoreo, Clientes/Lealtad, Personal, Tablero, Configuración.
- **Ubicaciones son datos, no organizaciones separadas:** una sola organización (Grupo Carvallo) con varias `RetailLocation`: Labash, Outlet del Norte, Casa Carballo (inactiva), Bodega (nueva). Una prenda vive en una ubicación a la vez.
- Todas las tablas nuevas multi-tenant por `organizationId`. Ninguna consulta devuelve datos de otra organización.
- Seguir el diseño existente del portal (el mismo de Realty/Talleres). No rediseñar el portal.

## Modelo de datos

Convenciones: `id`, `organizationId`, `createdAt`, `updatedAt`, borrado lógico cuando aplique. Montos en decimal con 2 decimales, nunca float. Moneda MXN. Precio de venta es el precio publicado al cliente; costo es interno, nunca se muestra al cliente final en web/WhatsApp/PDF de cliente.

### Ubicación — `RetailLocation`
| Campo | Notas |
|---|---|
| `nombre` | Labash / Outlet del Norte / Casa Carballo / Bodega |
| `tipo` | TIENDA / BODEGA |
| `formato` | PREMIUM / OUTLET / HOGAR / BODEGA |
| `activa` | Casa Carballo nace inactiva. Activarla no requiere migración |
| `m2` | Opcional, para el indicador piezas por m² |
| `direccion` | TBD — no inventar |

### Prenda (pieza única) — `RetailItem`
Una fila = una prenda física. No hay "stock 5" de un modelo: hay 5 filas, cada una con su código.

| Campo | Notas |
|---|---|
| `codigo` | Único por organización. Ej. `LAB-TOM-CAM-H-M-AZUL-001` (formato de ejemplo ya usado en la propuesta; la regla de generación queda en Configuración, no se inventa otra sin validar) |
| `qr` | Código QR derivado del `codigo`, imprimible en etiqueta |
| `locationId` | Ubicación actual (bodega o sucursal) |
| `canal` | TIENDA / EN_LINEA / MAYOREO. Una pieza asignada a mayoreo no se vende en tienda |
| `estado` | DISPONIBLE / APARTADA / VENDIDA / EN_TRASLADO / MERMA |
| `marca`, `categoria`, `tipoPrenda` | Ej. vestido, camisa, tacón |
| `talla`, `color`, `estilo` | Campos libres + catálogo editable |
| `costo` | Interno, obligatorio para calcular ganancia (si no se conoce al alta, queda TBD y el tablero lo marca como sin costo, no inventa un costo) |
| `precioVenta` | Precio publicado |
| `precioConDescuento` | Calculado, nunca editado a mano |
| `fotoUrl` | Foto tomada al alta |
| `fechaIngreso`, `diasPermanencia` | Derivado: hoy menos fechaIngreso |
| `vendedorAltaId` | Quién la catalogó |

Índice único por organización en `codigo`. El QR no se reutiliza.

### Movimiento — `RetailMovement`
Toda entrada, salida o cambio pasa por aquí. Sin movimiento no hay cambio de ubicación/estado.

| Campo | Notas |
|---|---|
| `itemId` | Prenda |
| `tipo` | ALTA / VENTA / APARTADO / LIBERACION_APARTADO / TRASLADO / DEVOLUCION / AJUSTE / MERMA / A_MAYOREO |
| `deLocationId` / `aLocationId` | Origen y destino (bodega → Labash, etc.) |
| `deCanal` / `aCanal` | Cambio de canal, si aplica |
| `realizadoPorId` | **Obligatorio: quién hizo el movimiento** |
| `fecha` | Fecha/hora del escaneo |
| `motivo` | Obligatorio en AJUSTE y MERMA |
| `saleId` / `palletId` | Origen, cuando aplica |

Regla: escanear el QR registra el movimiento. Un traslado deja la pieza EN_TRASLADO hasta confirmar recepción en destino.

### Venta — `RetailSale` + `RetailSaleItem`
| Campo | Notas |
|---|---|
| `folio` | Secuencia desde cero en Reymen, por organización |
| `locationId` | Donde se vendió |
| `canal` | POS / WHATSAPP / WEB |
| `vendedorId` | **Obligatorio: quién realizó la venta** |
| `clienteId` | CRM Customer, opcional en menudeo anónimo, obligatorio para lealtad |
| `metodoPago` | EFECTIVO / TARJETA / TRANSFERENCIA |
| `descuentoId` | Plan A/B/C aplicado, si aplica |
| `subtotal`, `descuentoTotal`, `total` | Calculados desde las líneas |
| `costoTotal` | Interno, para ganancia |
| `facturaSolicitada` | Boolean. En MVP no timbra; solo se registra |
| `estado` | COMPLETADA / CANCELADA (una cancelada devuelve las piezas a DISPONIBLE con movimiento) |

`RetailSaleItem`: `itemId` (pieza única, una por línea), `precioVenta`, `descuentoAplicado`, `importe`, `costo`. Una pieza VENDIDA no se puede vender dos veces: la venta es una transacción atómica que bloquea la pieza, verifica su estado, cambia el estado y crea el movimiento en el mismo paso. Si dos canales (POS, WhatsApp, web) intentan vender la misma pieza a la vez, solo uno concreta la venta; el otro se rechaza con aviso y queda registrado como intento de doble venta. Si la pieza no está DISPONIBLE (o APARTADA por ese mismo cliente/canal), la venta se rechaza. Devoluciones y cancelaciones no editan la venta a mano: crean un movimiento autorizado y auditado que regresa la pieza a DISPONIBLE (o a su estado previo) y ajusta caja e inventario en la misma transacción.

### Apartado — `RetailHold`
| Campo | Notas |
|---|---|
| `itemId`, `clienteId` (CRM), `canal` | WhatsApp / web / tienda |
| `venceEn` | Límite de tiempo. Al vencer, auto-liberación: pieza vuelve a DISPONIBLE con movimiento LIBERACION_APARTADO |
| `estado` | ACTIVO / CONVERTIDO_VENTA / LIBERADO / VENCIDO |

Un apartado no es una venta. No mueve caja. Solo bloquea la pieza.

### Descuento / Plan — `RetailDiscountPlan`
Plan A, B o C por semana. `nombre`, `porcentaje`, `aplicaA` (tienda/canal/categoría), `metodoPago` (efectivo/tarjeta, ej. 60% efectivo / 50% tarjeta), `vigenciaDesde/Hasta`, `estado` BORRADOR / APROBADO / APLICADO / RECHAZADO, `aprobadoPorId`, `aprobadoEn`. Flujo: alguien propone → dueño autoriza → solo entonces se aplica en POS y web. Sin aprobación no se aplica.

### Cliente / Lealtad — reutilizar CRM + LOYALTY
No crear tabla de personas nueva. Cliente = CRM `Customer` / `Lead`. Lealtad guarda solo: `clienteId`, `puntos` (si aplica — TBD, no inventar regla de puntos), `frecuenciaCompra`, `ticketPromedio`, `ultimaVisita`, `beneficios`. Fase 2/3, no MVP.

### Personal — `RetailEmployee` + `RetailAttendance`
Fase 3 (evaluar, no MVP): `nombre`, `locationId`, `rol` (VENDEDOR / CAJERO / BODEGA / GERENTE), `activo`. `RetailAttendance`: `employeeId`, `entrada`, `salida`, `locationId`. Consultas por empleado y sucursal. El vendedor de una venta es un `RetailEmployee` (o usuario del sistema — definir en implementación, no duplicar usuarios).

### Mayoreo / Pallet — `RetailPallet` + `RetailPalletItem`
| Campo | Notas |
|---|---|
| `codigo` | Único, ej. `PAL-2026-####` |
| `estado` | ARMADO / PUBLICADO / APARTADO / VENDIDO / CANCELADO |
| `precioPallet` | Precio del lote cerrado |
| `compradorId` | Mayorista (CRM), cuando se vende |
| `criterioArmado` | Rotación / días de permanencia / excedente — el módulo sugiere qué piezas destinar a mayoreo, no solo armar a mano |
| `venceEn` | Apartado con límite y auto-liberación, igual que RetailHold |

`RetailPalletItem`: piezas del pallet. Al venderse el pallet, cada pieza pasa a VENDIDA con movimiento A_MAYOREO y se da de baja del inventario de menudeo en la misma transacción. Un pallet es un lote cerrado: no se vende por pieza suelta desde el pallet.
**Pallets variables:** la composición cambia según rotación. No hay una composición fija inventada en este spec.

### Bodega
No es una tabla aparte: es una `RetailLocation` tipo BODEGA. Todo movimiento bodega ↔ sucursal pasa por `RetailMovement` con escaneo QR.

## Flujos

### Alta de prenda
Entra mercancía a bodega → se cataloga (foto, marca, talla, color, estilo, costo, precio) → se genera código único + QR → se imprime etiqueta → pieza DISPONIBLE en bodega → traslado a tienda por QR (EN_TRASLADO → DISPONIBLE en tienda).

### Venta en POS (MVP)
Escanear QR (o buscar código) → sistema valida DISPONIBLE → se registra vendedor (obligatorio) → se aplica descuento aprobado vigente, si aplica → cobro (efectivo/tarjeta/transferencia) → pieza VENDIDA + movimiento VENTA + caja INGRESO, todo en una transacción. Corte diario por tienda y consolidado.

### Venta por WhatsApp / web
Cliente pide pieza → agente/web verifica DISPONIBLE → apartado con límite → cliente confirma → venta (mismo flujo, canal WHATSAPP/WEB) o vencimiento → auto-liberación. Nunca vender una pieza APARTADA por otro cliente ni una VENDIDA.

### Traslado bodega → tienda
Escanear QR en bodega (salida, EN_TRASLADO, quién/cuándo) → escanear en tienda al recibir (entrada, DISPONIBLE en Labash, quién/cuándo). Sin confirmación de recepción, la pieza sigue EN_TRASLADO y no se puede vender.

### Mayoreo
Módulo sugiere piezas por rotación/días/excedente → se arma pallet (lote cerrado, precio) → se publica en web B2B → mayorista aparta con límite → se vende → piezas a VENDIDA + baja de menudeo. Si vence el apartado, se libera el pallet.

### Descuentos
Propuesta Plan A/B/C → dueño aprueba → se aplica en POS y web en la vigencia. El tablero muestra margen bruto comercial y contribución operativa por descuento.

## Tablero e indicadores (definir en Fase 1, calcular desde datos)

- Venta del día, dos métricas separadas (NO utilidad neta): Margen bruto comercial = (precio de venta - descuento aplicado) - costo de adquisición. Contribución operativa por prenda = margen bruto comercial - comisión de pago; las devoluciones restan. La contribución operativa es una métrica operativa propia de Reymen, no utilidad contable ni neta. No incluye renta, sueldos, luz, pauta ni otros gastos del negocio. Los escenarios Plan A/B/C muestran ambas métricas.
- Filtros día / semana / mes / año / años.
- Piezas por m² de tienda (requiere `m2` por ubicación).
- Días de permanencia por pieza y por categoría.
- Rotación (ventas / inventario promedio en el periodo).
- Excedentes (piezas con muchos días sin vender, umbral configurable, no inventar un número).
- Necesidades de reabastecimiento (por debajo de mínimo por categoría/talla — mínimo configurable).
- Ventas por vendedor, por canal y por tienda.
- Dobles ventas intentadas (rechazadas por el sistema) — contador, para validar que el control funciona.
- Ningún total se captura a mano: todo se calcula desde ventas, movimientos y costos.

## Meta Ads — asistente de IA (Fase 3, no MVP)

Proponer un asistente que analice campañas, recomiende estrategias y sugiera redistribuir presupuestos hacia las campañas con mejores resultados. `MARKETING_ADS` no existe todavía en el repo (reservado, sin schema/UI) — hay que construirlo en Fase 3, no reutilizarlo. No está en el MVP. Gasto en anuncios aparte, pagado directo a Meta. No inventar métricas de campañas ni resultados.

## Web pública de ventas (Claude Code, separada del módulo)

- Una web centralizada para los 3 negocios, conectada al mismo inventario.
- Mismo precio, mismo stock: si la pieza se vende en tienda, desaparece de la web.
- Mayoreo por pallet en web B2B, como lote cerrado (ver módulo Mayoreo).
- Cada solicitud / compra en web crea un Lead / venta en Reymen, sin recaptura.
- No publicar con fotos, precios, servicios ni cifras inventadas. Solo datos confirmados del grupo.
- Diseño: colores Reymen (azul marino profundo, azul rey, blanco), logo real integrado — el mismo criterio ya usado en la propuesta de 1 página.

## Plazo realista — 12-14 semanas (corrección 23 nov, antes 7 semanas, demasiado agresivo)
- Semanas 1-2: levantamiento, diseño y modelo de datos.
- Semanas 3-8: POS, inventario por pieza, QR y movimientos (Fase 1, entrega semana 7-8).
- Dentro de Fase 1: descuentos, reportes, migración GESEM y piloto.
- Semanas 9-12: web, WhatsApp y lealtad (Fase 2).
- Semanas 12-14: pruebas, estabilización y despliegue (Fase 2, entrega semana 12-14).
- Solicitud de Cambio: cualquier requerimiento fuera de alcance (terminales bancarias, nuevo mecanismo de promociones, cambio de flujo de caja) genera Solicitud de Cambio con presupuesto y fecha revisados, solo con aprobación por escrito; no mueve el plazo salvo acuerdo escrito.
- WhatsApp: una conversación = ventana de 24 h de Meta con un cliente; las 500/mes cubren solo plataforma Reymen + agente IA, no cargos Meta/Twilio/BSP, que van aparte.
- Condicionado a anticipo, datos y aprobaciones en 2 días hábiles; la tienda sigue vendiendo durante el proceso.

## Límites de uso incluidos en la mensualidad $2,999/mes (plan Grupo Carvallo)
Hasta 3 ubicaciones activas, hasta 10 usuarios, hasta 2 terminales POS, hasta 5,000 ventas/mes, hasta 10 GB de fotografías, hasta 500 conversaciones WhatsApp IA/mes, soporte hasta 4 horas/mes. Excedentes se cotizan aparte por escrito.

## Seguridad, datos y disponibilidad (para el contrato, no solo técnica)
- Grupo Carvallo es responsable de los datos personales de sus clientes; Reymen es encargado, solo los trata para el servicio, conforme a LFPDPPP.
- Accesos por rol, copias de seguridad diarias (retención 30 días), aviso de incidente en 48 h, devolución/eliminación en 15 días al terminar.
- Soporte lun-vie 9-18 y sáb 9-14 Monterrey; disponibilidad objetivo 99% mensual, incidente crítico POS sin vender: respuesta 2 h hábiles, recuperación objetivo 8 h hábiles.
- Aceptación: cliente 2 días hábiles para aprobar u observaciones documentadas; silencio tras recordatorio + 2 días = aceptada; rechazo debe justificar la prueba que falla.

## Alcance web Fase 2 y pagos (corrección 23 nov)
- Web = apartado + confirmación por WhatsApp. Sin checkout en línea, sin pasarela, sin cálculo de envío, sin devoluciones en línea.
- Entrega solo recolección en tienda (Labash / Outlet del Norte). Pago confirmado en tienda o transferencia verificada. Devoluciones solo en tienda.
- POS solo registra método y monto, no procesa pagos con tarjeta. Integración con terminales/pasarelas se cotiza por separado. Reymen no guarda datos de tarjetas.
- Eliminación de datos: sistemas activos en 15 días; respaldos cifrados se eliminan por ciclo de retención de 30 días, sin usarse salvo desastre.
- Incidentes críticos no se descuentan del límite de 4 h/mes de soporte; SLA 99% mensual = hasta 7.2 h permitidas en mes de 30 días, sin exclusiones.

## Fases

### Fase 0 — Auditoría (Codex, antes de codificar)
Leer el repo, verificar que el patrón Realty sigue vigente (enum, `src/lib/modules.ts`, `OrganizationModule`, `requireModule`, rutas `/portal/*`), y reportar cualquier cambio antes de escribir código. No asumir que el repo está igual que el 11 nov.

### Requisitos operativos previos a Fase 1 (sin esto no se puede cerrar volumen ni tiempo)
Antes de iniciar, el cliente debe confirmar por escrito: piezas totales por tienda, cuántas se etiquetarán individualmente con QR, quién toma las fotos, quién imprime las etiquetas QR, y si habrá artículos sin código (esos quedan fuera del inventario único hasta tener código; no se pueden seguir por pieza). La migración incluida en la propuesta cubre hasta 3,000 prendas en el lote inicial; por encima se cotiza aparte por lote. Cientos de prendas no es lo mismo que decenas de miles: el piloto en un rack de Labash mide el tiempo real por prenda antes de comprometer el volumen total.

### Fase 1 — Base (MVP usable)
1. Enum `RETAIL`, registro, entitlement, guard, ruta `/portal/retail`.
2. `RetailLocation` (Labash, Outlet, Casa Carballo inactiva, Bodega), `RetailItem` con código único + QR, alta con foto.
3. `RetailMovement` por QR (alta, traslado, ajuste con motivo).
4. POS Reymen sin facturación: venta con vendedor obligatorio, descuento aprobado, cobro, corte diario. Gancho CFDI listo (campo `facturaSolicitada`, totales separados), sin timbrado.
5. Apartados con vencimiento y auto-liberación.
6. Descuentos Plan A/B/C con aprobación.
7. Panel + Tablero básico con venta del día y margen bruto comercial y contribución operativa por prenda (no utilidad neta), por tienda y consolidado.
8. Migración desde GESEM por Excel (importación de catálogo/clientes/historial por lotes, con validación y reporte de errores). No integración en vivo con GESEM en el MVP.
9. Pruebas de aceptación de Fase 1 (ver abajo).

### Fase 2 — Venta
10. Web pública de ventas conectada al inventario (Claude Code, con este spec + `prompt-web-ventas-claude-code.md`).
11. WhatsApp con agente IA (`AI_WHATSAPP`): consulta, apartado, venta, sin doble venta.
12. Lealtad: registro de clientes, frecuencia, ticket, beneficios.
13. Indicadores completos (piezas por m², días, rotación, excedentes, reabastecimiento).
- Puntos 11-13 se construyen con Codex después de Fase 1 aceptada, con `prompt-fase2-codex.md` (23 nov 2026). No se construyen dentro de la Fase 1.

### Fase 3 — Crecimiento
14. Mayoreo por pallet con sugerencia por rotación + web B2B.
15. Control de personal: entradas/salidas, consultas por empleado y sucursal.
16. Asistente IA de Meta Ads (análisis, recomendación, redistribución de presupuesto).
17. Facturación con proveedor externo de CFDI (cuando el dueño lo pida). No antes.

## Fuera del MVP (no construir en Fase 1)

- Facturación electrónica / CFDI timbrado.
- Asistente IA de Meta Ads.
- Control de personal completo (solo vendedor por venta en Fase 1).
- Mayoreo por pallet (Fase 3, aunque su modelo de datos puede dejarse preparado).
- Portal del cliente para aprobar apartados en línea.
- Multi-organización / franquicias (la arquitectura multi-tenant ya lo permite, no es un feature del MVP).

## Criterios de aceptación

**Fase 1:**
- Org sin RETAIL no ve el módulo; org con RETAIL abre `/portal/retail` sin errores.
- Se puede dar de alta una prenda con código único + QR, foto, costo y precio, en Bodega.
- Escanear el QR mueve la prenda Bodega → Labash y registra quién/cuándo; sin recepción, queda EN_TRASLADO y no se vende.
- Venta en POS: exige vendedor, valida DISPONIBLE, aplica solo descuento aprobado, cambia la pieza a VENDIDA y crea caja en la misma transacción.
- Intentar vender una pieza VENDIDA o APARTADA por otro cliente se rechaza y se cuenta. En Fase 1 esta prueba es solo dentro del POS; la prueba multicanal POS+web+WhatsApp es de Fase 2 y no bloquea el pago de Fase 1.
- Apartado vence y auto-libera la pieza.
- Descuento sin aprobación no se aplica en POS ni en web.
- Casa Carballo nace inactiva y no aparece como tienda operativa; activarla es un cambio de estado, no una migración.
- Panel muestra venta del día y margen bruto comercial y contribución operativa por prenda (no utilidad neta) calculadas desde datos, por tienda y consolidado, con filtros.
- Importación desde Excel de GESEM carga catálogo con reporte de filas con error, sin duplicar códigos.

**Fase 2:**
- Una pieza vendida en tienda desaparece de la web en el mismo momento (misma transacción / mismo inventario).
- WhatsApp aparta y vende sin doble venta.
- Lealtad registra frecuencia y ticket por cliente.

**Fase 3:**
- Pallet vendido da de baja todas sus piezas de menudeo en una transacción.
- Asistente Meta recomienda redistribución solo con datos reales de campañas, no con métricas inventadas.

## Datos pendientes — no inventar

Siguen 12 de 13 respuestas del dueño pendientes (1 contestada: GESEM con export a Excel, alcance por verificar). Sin esos datos no se cierra precio ni alcance final:
piezas por tienda, mensajes WhatsApp/día y fotos/semana, quién toma fotos, % WhatsApp vs físico, dobles ventas/semana, composición/precio/compradores/frecuencia de pallet, piloto Semana 1 (rack Labash, día, acompañante), Meta Business Manager y acceso a las 4 páginas, presupuesto mensual de campañas y quién hace fotos/videos, nuevos mercados.
Además, para el POS: quiénes son los vendedores (nombres/roles por tienda), qué `m2` tiene cada tienda, umbrales de excedente y de reabastecimiento, y si el dueño quiere que Casa Carballo se active en Fase 1 o después.
No inventar: precios de prendas, costos, número de piezas, nombres de vendedores, direcciones de tiendas, ni resultados de campañas.

## Equipo (18 nov, nivel igual)

Reynol y Emiliano (Emi) socios al mismo nivel, deciden en conjunto. Emi: comercial, relación con el dueño, contacto GESEM, accesos WhatsApp/Meta, piloto en tienda, QA. Reynol: arquitectura, base de datos, prompts IA, n8n en producción, decisión final técnica. Lance, hermano de Reynol, practicante: catalogación, limpieza de Excel, QA, documentación. Lance coordina con Emi en tienda y con Reynol en lo técnico, escala a los dos. No habla directo con el dueño de precio/alcance ni manda nada al cliente sin revisión.

## Lista de trabajo para desarrollo

1. Auditoría Fase 0 del repo.
2. Prisma: enum `RETAIL`, tablas Location/Item/Movement/Sale/SaleItem/Hold/DiscountPlan/Pallet/PalletItem (+ Employee/Attendance en Fase 3), migraciones.
3. Registro del módulo, entitlement, guards.
4. Rutas `/portal/retail` + pestañas + Panel calculado.
5. Alta de prenda + QR + etiqueta imprimible.
6. Movimientos por QR con quién/cuándo.
7. POS sin facturación + vendedor obligatorio + caja + corte.
8. Apartados + auto-liberación + descuentos con aprobación.
9. Tablero + indicadores Fase 1.
10. Importación Excel GESEM.
11. Web pública (Claude) + WhatsApp (Fase 2).
12. Lealtad, mayoreo, personal, Meta IA, CFDI (Fase 3).
13. Docs en `docs/retail/` (PRD.md, ARCHITECTURE.md, DATABASE.md, API.md, SECURITY.md, TASKS.md, PROGRESS.md, DECISIONS.md, HANDOFF.md) para que otro agente continúe sin rework.

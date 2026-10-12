# Automatizaciones Reymen — Análisis y arquitectura propuesta

> **Estado:** **APROBADA por el usuario (2026-10-05).** Ver §K para las decisiones y el orden de trabajo acordado. Sigue en §K → "Siguiente paso".
> **Fecha:** 2026-10-05.
> **Tenant piloto:** Villa Gardenia. Todo lo de abajo es genérico y multi-tenant.
> **Base:** revisión de `ReymenApp` (`main` @ `36184fa`) y `ReymenPOS` (`main` @ `f9a5dcf`), y las decisiones de `docs/HANDOFF.md`.

Principio rector: **Reymen decide QUÉ debe ocurrir; n8n decide CÓMO se ejecuta la integración externa.** Si n8n está caído, el POS y ReymenApp siguen funcionando: las acciones quedan pendientes y se reintentan.

---

## A. Estado actual: qué ya tenemos y se puede reutilizar

### Ingesta de eventos (ReymenApp)
| Pieza | Dónde | Reutilizable para |
|---|---|---|
| Patrón *store-then-process*: `WebhookEvent` con idempotencia `@@unique([organizationId, source, externalEventId])`, estados y reintentos | `src/lib/webhook-ingest.ts`, `src/lib/webhook-retry.ts` | Callbacks de n8n hacia el motor |
| Webhook por organización: HMAC de `"<timestamp>.<body>"` con el secreto de **esa** org, ventana ±5 min, rate limit 120/min, `precheck` antes de registrar | `src/lib/org-webhook-route.ts`, `src/lib/webhook-validator.ts` | Mismo patrón de firma y anti-replay en el contrato nuevo |
| Cron protegido con `CRON_SECRET` (Bearer, comparación en tiempo constante) | `src/app/api/cron/retry-webhooks/route.ts` | El "reloj" del motor (`/api/cron/automations/*`) |
| Ventas del POS: `POST /api/webhooks/pos/orders` → `processFoodPosOrder` en **una transacción** (venta, conteos diarios, consumo por receta, movimientos de inventario) | `src/lib/food.ts:1037` | Punto donde nace `sale.completed` (outbox en la misma transacción) |

### n8n (ReymenApp)
| Pieza | Dónde | Nota |
|---|---|---|
| Salida firmada: `triggerN8nWorkflow(path, payload)`, HMAC con `N8N_WEBHOOK_SECRET`, timeout de 5 s, `webhookPath` validado contra path traversal | `src/lib/n8n.ts` | Base del despachador. Hoy solo se usa para `whatsapp-outbound` |
| "La plataforma guarda la configuración, n8n ejecuta": recordatorios de citas y seguimientos de leads. n8n consulta `/api/v1/*/due-*` y reporta `*-sent`; un log evita enviar dos veces | `AppointmentReminderRule/Log`, `FollowUpRule/Log`, docs técnicas §7 | Mismo espíritu; el motor lo generaliza y lo vuelve *push* desde Reymen |
| Estado de entrega de WhatsApp: `Message.deliveryStatus` actualizado por n8n (`message.status`) | `src/lib/webhook-processors.ts` | Saber si un mensaje se **entregó** sirve para la atribución |
| `Automation` por org (`type`, `status`, `config` Json, `n8nWorkflowId`, `webhookSecret` propio) y `AutomationEvent` (log que **n8n** reporta; si falla → `ERROR` y correo a los admins) | `prisma/schema.prisma:303` | La lista y la UI de `/portal/automations` ya existen |
| Catálogo `AutomationTemplate` → `TemplateVersion` (semver, `n8nWorkflowJson`, `defaultConfig`) → `TemplateInstallation` (uno por org) | `prisma/schema.prisma:896`, `src/lib/template-install.ts` | El concepto de versión e instalación por org ya existe, pero cada instalación supone **un workflow por cliente** (lo que queremos evitar) |

### Datos de negocio
- **CRM:** `Lead` (teléfono, email, `externalId`, tags, `doNotContact`, metadata), `Conversation` (`contactPhone`, canal), `Message`, `Appointment` (estados `CONFIRMED`, `CANCELLED`, `NO_SHOW`; recordatorios), `AuditLog`, `Metric`.
- **Food:** `FoodSale` (monto bruto y neto, canal, fuente POS o manual; las cancelaciones llegan como venta negativa), `FoodDishSale` y `FoodModifierOptionSale` (conteo por día), `FoodRecipeUsage`, `FoodInventoryMovement` (`SALE`, `WASTE`, `PURCHASE`, `ADJUSTMENT`, `PRODUCTION`…), `FoodInventoryItem` (`currentStock`, `minStock`), stock bajo calculado (`getFoodLowStockItems`), costo de lo vendido, centro de operaciones y delivery (`DeliveryOrder.customerName`).
- **Organización:** `timezone` (día de negocio), módulos (`hasModule`), plan.
- **SmartCard:** eventos por tarjeta (`qr_scan`, `whatsapp_click`, `save_contact`…) en Supabase, por empresa. No hay identidad de persona ligada a ventas.

### ReymenPOS
- Cada venta (`Sale` en IndexedDB) tiene líneas con precio, modificadores y notas; pagos (efectivo, tarjeta, transferencia, divididos); propina; empleado; mesa y personas (`tableName`); cancelación con motivo y quién autorizó; y `cashSessionId`.
- Turno: `CashSession` con apertura, cierre, esperado, contado y diferencia.
- Cocina: `sentAt` y `readyAt` por línea en las órdenes de mesa (servidor del POS).
- Outbox transaccional con id determinista (`saleId`, `saleId-cancel`), sobre estándar `specVersion / id / type / occurredAt / source / data` (`src/lib/events.ts`). `customer.created` ya está **reservado**.
- **Pero el adaptador hacia Reymen (`src/lib/reymen/orders.ts`) solo envía:** `occurredAt`, `channel`, `grossAmount`, `netAmount` y `items[{variantId, quantity, modifiers}]`. **No** envía `orderId`, cliente, pagos, empleado, propina, mesa ni personas.

---

## B. Gaps (qué falta)

| # | Falta | Impacto | Prioridad |
|---|---|---|---|
| 1 | **Identidad del cliente en la venta.** El POS no captura cliente y `FoodSale` no tiene `customerId` | Sin esto no existen recuperación, segunda visita, feedback, VIP, cumpleaños ni **atribución**. Es el gap #1 | Foundation |
| 2 | `FoodSale` sin id de la orden del POS (`externalOrderId`). La cancelación no se liga a la venta original | Atribución por venta, contar tickets y cancelaciones reales, auditar | Foundation |
| 3 | Consentimiento y política de contacto: opt-in de marketing, horario permitido, tope de mensajes por cliente, cooldown global | Legal (LFPDPPP / aviso de privacidad) y reputación; Meta exige opt-in para WhatsApp de marketing | Foundation |
| 4 | **Outbox de eventos de dominio en ReymenApp.** Hoy no existe; `AutomationEvent` lo escribe n8n, no el motor | Desacoplar ventas de n8n; idempotencia y reintentos | Foundation |
| 5 | Motor (trigger → condiciones → acciones), ejecuciones, reintentos, dry-run | Núcleo de la plataforma | Foundation |
| 6 | Reloj interno: no hay cron dentro de la app; todo es externo | Detectores por tiempo (inactividad, reporte diario) | Foundation |
| 7 | Contrato de salida por **acción genérica** (no por cliente) y callback autenticado por ejecución | Workflows de n8n reutilizables entre restaurantes | Foundation |
| 8 | Modelo de feedback (calificación, comentario, seguimiento) | P0 #3 | P0 |
| 9 | Atribución (contacto → venta) | P0 #6 | P0 |
| 10 | Cumpleaños (fecha de nacimiento del cliente) | P1 | P1 |
| 11 | El POS no tiene **descuentos** | "Alertas de descuentos" no es implementable hasta que existan | Bloqueado |
| 12 | Reservaciones de restaurante (no hay; `Appointment` podría reutilizarse) | Reservaciones / no-show | P1 (requiere producto) |
| 13 | Tiempos de cocina y cierre de turno se quedan en el POS | `kitchen.sla_exceeded`, `shift.closed` → eventos nuevos del POS | P1 / P2 |
| 14 | Velocidad de consumo por insumo | Pronóstico de inventario. **Sí hay datos** (movimientos `SALE`), solo falta el cálculo | P1 |

### Eventos que se pueden soportar con los datos actuales
- **Hoy:** `sale.completed`, `sale.cancelled`, `inventory.low` / `inventory.critical` (con `minStock`), `inventory.waste_recorded` (movimiento `WASTE`), datos del reporte diario (ventas, tickets, ticket promedio, comparativos, top productos, cancelaciones, stock crítico, merma).
- **Tras la foundation de cliente (gap 1):** `customer.created`, `customer.visit`, `customer.second_visit_due`, `customer.at_risk`, `customer.vip`, `customer.segment_changed`. `customer.birthday` necesita además la fecha de nacimiento.
- **Todavía no:** `reservation.*`, `kitchen.sla_exceeded`, `shift.closed` (requieren eventos nuevos del POS), alertas de descuento (el POS no tiene descuentos), `anomaly.detected` (requiere al menos 4–8 semanas de historia).
- **`inventory.overstock`:** posible, pero hoy no hay un "máximo" por insumo; queda para P2 (Smart Inventory Recovery).

---

## C. Arquitectura propuesta

```
ReymenPOS (offline-first)                 ReymenApp                                            n8n (ejecución)
─────────────────────────                 ─────────────────────────────────────────────         ─────────────────
venta + cliente opcional ──outbox──►  /api/webhooks/pos/orders
                                      processFoodPosOrder ─┐ MISMA transacción
                                        FoodSale, inventario,│
                                        Customer + stats,     │
                                        DomainEvent(sale.completed) ◄┘
                                                │
  reloj externo (cron del VPS) ──► /api/cron/automations/tick (cada 5 min)
                                      1. Detectores por tiempo → DomainEvent
                                         (customer.at_risk, inventory.low,
                                          report.daily_due…)
                                      2. Motor: DomainEvent pendiente →
                                         automatizaciones activas con ese trigger →
                                         condiciones → política de contacto →
                                         AutomationExecution (única por automatización+evento)
                                      3. Despachador: acción → POST firmado ────────────────►  reymen-action-message
                                         (timeout 5 s, reintentos con backoff)                  reymen-action-staff-alert
                                                                                                reymen-action-report
                                      /api/webhooks/n8n/automation-executions ◄── callback ──  (resultado, id del proveedor)
                                         actualiza ejecución, entrega, error
                                      4. Atribución: sale.completed de un cliente
                                         contactado → AutomationConversion
```

### C.1 Capas

1. **Identidad de cliente** (`Customer`, nuevo y separado de `Lead`).
   - Por qué no reutilizar `Lead`: los comensales romperían los KPIs del CRM, el embudo de leads y el **límite de leads del plan** (Starter = 500).
   - `Customer` puede ligarse opcionalmente a un `Lead` (`leadId`) y se relaciona con `Conversation` por teléfono.
   - Teléfono normalizado E.164, único por organización.
   - Consentimiento explícito (`marketingConsent`, `consentAt`, `consentSource`) y `doNotContact`.
2. **Estadísticas del cliente** (columnas en `Customer`, recalculables desde las ventas): visitas, primera y última visita, gasto total, ticket promedio, intervalo promedio entre visitas, tendencia y segmento.
   - Se actualizan de forma incremental en la misma transacción de la venta.
   - Una función `rebuildCustomerStats(orgId)` las reconstruye desde cero. La fuente de verdad siempre son las ventas.
3. **Outbox de eventos de dominio** (`DomainEvent`).
   - Se escribe en la **misma transacción** que el hecho, así que nunca se pierde y nunca bloquea: es un `INSERT`.
   - `dedupeKey` único por org; por ejemplo `sale.completed:<posOrderId>` o `customer.at_risk:<customerId>:<episodio>`.
   - `correlationId` = id del evento del POS; `causationId` = evento que lo originó.
4. **Detectores** (funciones puras y deterministas sobre las estadísticas, ejecutadas por el cron con la zona horaria de la org).
   - Emiten eventos de estado como `customer.at_risk` **una vez por episodio**: hasta que el cliente vuelva, no se repite.
5. **Motor**.
   - Por cada `DomainEvent` pendiente busca las automatizaciones activas de **esa** org con ese trigger.
   - Evalúa las condiciones (esquema por blueprint), aplica la **política de contacto** y crea `AutomationExecution`.
   - `@@unique([automationId, domainEventId])` garantiza que un evento reprocesado nunca dispare dos veces.
6. **Despachador**.
   - Resuelve la acción: interna (crear alerta o tarea en Reymen) o externa (n8n).
   - Firma, envía con timeout y marca `DISPATCHED`.
   - Si falla: reintento con backoff (1, 5, 30 min, 2 h, 12 h) y luego `FAILED` (dead letter visible en Admin).
   - **Modo dry-run** por automatización: evalúa y registra "se habría enviado a X" sin llamar a n8n. Así se valida el piloto sin molestar a clientes reales.
7. **Atribución**: tabla de conversiones, con reglas abajo (§F).

### C.2 Blueprints e instancias (sin duplicar lógica)

- **Blueprint = código versionado**, no filas en la base. Por ejemplo `src/lib/automation/blueprints/customer-recovery.v1.ts` declara:
  - `key`, `version`, `trigger`;
  - `configSchema` (Zod, con valores por defecto y límites);
  - `conditions(event, ctx, config)`, función pura y probada;
  - `actions` (tipo de acción, plantilla y canal), `defaultCooldown` y `conversionWindow`;
  - y, si cambia la versión, `migrateConfig(fromVersion)`.
  - Por qué en código: la lógica vive con pruebas y revisión de PR, no editable a mano en producción.
  - Un **registro** (`blueprints/index.ts`) expone el catálogo: nombre, descripción, módulos requeridos y estado (`active` / `deprecated`).
- **Instancia = el `Automation` existente**, extendido con columnas opcionales: `blueprintKey`, `blueprintVersion`, `trigger`, `dryRun`, `lastRunAt`, `lastStatus`.
  - Con `blueprintKey` → la maneja el motor. Sin él → automatización n8n heredada, que sigue igual (`AutomationEvent`).
  - Así `/portal/automations` muestra ambas en un solo lugar y no se rompe nada.
  - `@@unique([organizationId, blueprintKey])` mientras haya una instancia por blueprint.
- **Versionado:**
  - Una instancia queda fija en `blueprintVersion`.
  - `v1` sigue en el código mientras haya instancias activas que lo usen.
  - Una `v2` se activa para instancias nuevas.
  - Migrar es explícito (Admin → "actualizar a v2"), usa `migrateConfig` y queda en bitácora.
  - Deprecar impide instalaciones nuevas sin tocar las existentes.
- **Catálogo existente (`AutomationTemplate` y compañía):** se queda para los workflows heredados (un workflow por cliente). Los blueprints **no** guardan `n8nWorkflowJson`: los workflows de n8n son genéricos **por tipo de acción** y viven versionados en el repo (`n8n/workflows/*.json`).
- **Configuración por tenant:** `Automation.config` validado contra el `configSchema` de la versión.
  - Villa Gardenia: `{ minVisits: 3, channel: "whatsapp", cooldownDays: 30 }`.
  - Restaurante B: `{ minVisits: 5, channel: "email", cooldownDays: 45 }`.
  - Mismo código.

### C.3 Contrato Reymen → n8n

Se alinea con el sobre estándar que ya usa el POS (`specVersion`, `id`, `type`, `occurredAt`, `source`, `data`) y con la firma `"<timestamp>.<body>"` que ya usan todos los webhooks.

```http
POST {N8N_BASE_URL}/webhook/reymen-action-message
X-Reymen-Signature: sha256=<HMAC_SHA256("<timestamp>.<body>", N8N_WEBHOOK_SECRET)>
X-Reymen-Timestamp: 1759680000000
X-Reymen-Event-Id: <actionAttemptId>
```
```json
{
  "specVersion": "1.0",
  "id": "exa_…",
  "type": "action.message.send",
  "occurredAt": "2026-10-05T18:00:00.000Z",
  "organization": { "id": "org_…", "timezone": "America/Mexico_City", "displayName": "Villa Gardenia" },
  "automation": { "id": "aut_…", "blueprintKey": "customer_recovery", "blueprintVersion": 1 },
  "execution": { "id": "exe_…", "attempt": 1, "dryRun": false },
  "trigger": { "eventId": "dev_…", "eventType": "customer.at_risk", "correlationId": "sale_…" },
  "subject": { "type": "customer", "id": "cus_…" },
  "recipient": { "channel": "whatsapp", "phone": "+5281…", "name": "Ana", "locale": "es-MX" },
  "content": { "templateKey": "customer_recovery_v1", "variables": { "name": "Ana", "businessName": "Villa Gardenia" } },
  "callback": { "url": "https://app.reymen.mx/api/webhooks/n8n/automation-executions", "token": "<HMAC(executionId)>" },
  "deadline": "2026-10-05T20:00:00.000Z"
}
```
- **Workflows genéricos por acción, no por cliente:** `reymen-action-message`, `reymen-action-staff-alert`, `reymen-action-report`. Nada de org ids, teléfonos ni plantillas fijos dentro del workflow; todo llega en el payload.
- **Seguridad:**
  - n8n verifica la firma y que el timestamp esté dentro de ±5 min (anti-replay).
  - El `id` es la llave de idempotencia; n8n ignora un `id` que ya procesó.
  - El payload solo lleva lo necesario para la acción: sin estadísticas internas ni montos que no se vayan a usar.
- **Callback:** `POST /api/webhooks/n8n/automation-executions`, firmado con el mismo esquema, con `executionId`, `callback.token`, `status` (`sent`, `delivered`, `failed`, `skipped`), `providerMessageId` y `error`.
  - Reymen recalcula el token del `executionId` (comparación en tiempo constante) y verifica que la ejecución pertenezca a la org.
  - Las transiciones de estado son idempotentes; un callback repetido no cambia nada.
  - Así el workflow genérico **no necesita el secreto de cada organización**.
- **Credenciales de proveedores** (WhatsApp Business, correo): viven en n8n, nunca en el cliente ni en el payload. El cliente nunca ve n8n.
- **Si n8n tarda o está caído:** el despacho ocurre en el cron, nunca dentro de la venta. Un timeout solo agenda un reintento.

### C.4 Reloj

- `POST /api/cron/automations/tick` (Bearer `CRON_SECRET`), invocado **cada 5 min por el cron del VPS** (`crontab` o un timer de systemd con `curl`). No usar n8n como reloj: si n8n cae, al menos la detección y el registro siguen.
- Cada tick: procesar el outbox → correr los detectores que toquen según la zona horaria de cada org → despachar pendientes y reintentos.
- Un candado (`pg_try_advisory_lock`) evita dos ticks simultáneos.
- Trabajo acotado por tick: lotes por org, con tope de tiempo.

---

## D. Separación de responsabilidades

| ReymenPOS | ReymenApp | n8n |
|---|---|---|
| Vender siempre, offline | **Fuente de verdad**: ventas, clientes, inventario, puntos, segmentos, métricas y atribución | Ejecutar acciones externas: WhatsApp, correo, notificaciones, IA generativa de *contenido* |
| Capturar el cliente **opcional** en el cobro (teléfono, nombre, consentimiento), sin depender de la red | Normalizar y deduplicar clientes; consentimiento y política de contacto | Plantillas del proveedor (las aprobadas por Meta) y credenciales del proveedor |
| Incluir `orderId` y cliente en el evento (outbox existente) | Eventos de dominio, detectores, condiciones, decisión y ejecuciones | Reportar el resultado al callback |
| A futuro: eventos `shift.closed` y `kitchen.ticket_ready` | Reintentos, dry-run, auditoría, UI y catálogo de blueprints | **Nunca:** consultar la base, decidir quién está en riesgo, calcular promociones ni modificar estado central |
| **Nunca:** depender de n8n ni de Reymen para cobrar | **Nunca:** bloquear una venta por el motor o por n8n | |

---

## E. Reglas de las automatizaciones P0 (deterministas y explicables)

1. **Recuperación de clientes (`customer_recovery`).**
   - v1: cliente con `visits ≥ minVisits` y `díasSinVisita > max(minDays, factor × intervaloPromedio)` (por defecto `factor = 2.5`, `minDays = 21`).
   - El intervalo es la **mediana** de sus intervalos, robusta a visitas sueltas.
   - Ejemplo: suele venir cada 12 días y lleva 30 → riesgo (30 > 2.5 × 12).
   - Un episodio por ausencia, con cooldown.
   - v2 a futuro: score con recencia, frecuencia, gasto y tendencia (sigue siendo determinista y explicable).
2. **Segunda visita (`second_visit`):** `visits = 1` y `díasDesdePrimera ≥ N` (configurable), una sola vez por cliente.
3. **Feedback post-visita (`post_visit_feedback`):**
   - `sale.completed` con cliente, con retraso configurable (por ejemplo 2 h) y respetando horario permitido.
   - n8n envía un **link a un formulario de Reymen**. La respuesta llega directo a la base; no se interpreta texto libre en n8n.
   - Calificación ≤ 3 → alerta interna, gerente notificado y seguimiento (`OPEN → RESOLVED`).
   - **Reseñas:** la invitación a reseña pública se ofrece **a todos los que respondan**, sin condicionarla a la calificación. Pedir reseñas solo a los satisfechos ("review gating") va contra las políticas de Google y de lo que pediste: no manipular ni suprimir opiniones.
4. **Reporte ejecutivo diario (`daily_executive_report`):**
   - Reymen arma un JSON con: ventas, tickets, ticket promedio, comparativo contra el día anterior y el mismo día de la semana pasada, top productos, cancelaciones, stock crítico y merma (`WASTE`).
   - Con la foundation de cliente agrega clientes nuevos y recurrentes. Descuentos y anomalías se agregan cuando existan sus datos.
   - n8n solo lo formatea y lo entrega.
5. **Inventario crítico (`inventory_low_alert`):**
   - `currentStock ≤ minStock` → bajo; `≤ 0` o debajo de un % del mínimo → crítico.
   - Un aviso por insumo y nivel hasta que se recupere.
   - **Nunca bloquea ventas** (decisión vigente).
6. **Atribución (`revenue_attribution`):** ver §F.

---

## F. Atribución conservadora y auditable

- **Contacto (`AutomationTouch`):** se registra cuando una ejecución se **envió con éxito** a un cliente (callback `sent` o `delivered`), con `channel`, `touchedAt` y `conversionWindowDays` (de la configuración, por defecto 7).
- **Conversión (`AutomationConversion`):**
  - Al llegar `sale.completed` de ese cliente, se busca el contacto **más reciente** (último contacto) cuya ventana siga abierta y que sea **anterior** a la venta.
  - Una venta se atribuye **como máximo a una** automatización.
  - Se guardan `saleId`, `customerId`, `automationId`, `executionId`, `touchId`, `attributedRevenue` (= monto **neto** de la venta, sin propina ni IVA), `ruleVersion` y `couponId` si aplica.
- **Exclusiones:**
  - ventas canceladas (la cancelación revierte la conversión con un registro, no borrando);
  - contactos fallidos o no entregados;
  - ventas del mismo día anterior al envío.
- **Lenguaje honesto en la UI:** "Ingresos asociados a automatizaciones (último contacto, ventana de 7 días)". Nunca "ingresos generados" a secas.
- **Incrementalidad (opcional, recomendado):** grupo de control aleatorio por automatización (por ejemplo 10 % no recibe el mensaje). Así se puede mostrar la diferencia de tasa de regreso contra el grupo de control, que es la prueba real de que la automatización **causó** el ingreso.

---

## G. Modelos nuevos o modificados (resumen)

| Modelo | Tipo | Campos clave |
|---|---|---|
| `Customer` | nuevo | `organizationId`, `phoneE164` (único por org), `name`, `email?`, `birthday?` (mes y día), `marketingConsent`, `consentAt`, `consentSource`, `doNotContact`, `leadId?`, estadísticas (`visits`, `firstVisitAt`, `lastVisitAt`, `totalNet`, `avgTicket`, `medianIntervalDays`, `segment`, `statsUpdatedAt`) |
| `FoodSale` | modificado (columnas opcionales) | `externalOrderId?` (único por org + fuente), `customerId?`, `cancelsSaleId?`, `guests?`, `employeeName?` |
| `DomainEvent` | nuevo | `organizationId`, `type`, `subjectType`, `subjectId`, `occurredAt`, `payload`, `dedupeKey` (único por org), `correlationId`, `causationId`, `status`, `attempts`, `nextAttemptAt`, `processedAt`, `error` |
| `Automation` | modificado (columnas opcionales) | `blueprintKey?`, `blueprintVersion?`, `trigger?`, `dryRun`, `lastRunAt?`, `lastStatus?` |
| `AutomationExecution` | nuevo | `organizationId`, `automationId`, `domainEventId` (único con `automationId`), `subjectType/Id`, `status` (`SKIPPED`, `PENDING`, `DISPATCHED`, `SUCCEEDED`, `FAILED`, `DRY_RUN`), `skipReason`, `attempts`, `nextAttemptAt`, `lastError`, `providerMessageId`, `dispatchedAt`, `completedAt`, `durationMs` |
| `AutomationTouch` / `AutomationConversion` | nuevos | ver §F |
| `CustomerFeedback` | nuevo (P0 #3) | `customerId`, `saleId?`, `executionId?`, `score`, `comment`, `status` (`OPEN`, `RESOLVED`), `assignedToId?`, `resolvedAt?`, `resolutionNote?` |

Todas las migraciones son incrementales: tablas nuevas y columnas opcionales, sin rellenos destructivos.

---

## H. Fases y PRs

> Los datos de clientes tardan semanas en acumularse. Por eso la captura de cliente en el POS va **primero**: mientras se construye el motor, ya se está juntando la historia que necesita la recuperación.

| Fase | PR | Repo | Objetivo | Modelos / migraciones | Endpoints / eventos | Pruebas | Riesgos | Criterio de aceptación |
|---|---|---|---|---|---|---|---|---|
| **1. Foundation: cliente** | 1 | App | `Customer` + estadísticas; `processFoodPosOrder` acepta `orderId` y `customer` **opcionales** (compatibles hacia atrás) y vincula la venta y la cancelación | `Customer`, columnas en `FoodSale` | mismo webhook, campos nuevos opcionales | normalización de teléfono, estadísticas incrementales = reconstrucción, aislamiento entre orgs, idempotencia | duplicados por formato de teléfono | Una venta con teléfono crea o actualiza al cliente; sin teléfono, todo igual que hoy |
| | 2 | POS | Capturar cliente **opcional** en el cobro (teléfono, nombre, casilla de consentimiento con texto de aviso de privacidad); offline; viaja en el evento | `Sale.customer?` en Dexie (sin índice nuevo) | `order.paid` con `customer` y `orderId` | captura offline, adaptador, cobro sin cliente intacto | fricción en caja (por eso es opcional) | Se puede cobrar igual que hoy; si se captura, llega a Reymen |
| | 3 | App | Food → Clientes (lista y detalle de solo lectura: visitas, gasto, última visita) | — | — | permisos y aislamiento | — | El gerente ve a sus clientes |
| **2. Foundation: motor** | 4 | App | `DomainEvent` outbox; emitir `sale.completed`, `sale.cancelled` y `customer.created` en la misma transacción; cron `tick` con candado | `DomainEvent` | `/api/cron/automations/tick` | dedupe, rollback de la venta = sin evento, candado | volumen de la tabla (índices y purga a 90 días) | Venta → un evento, nunca dos |
| | 5 | App | Registro de blueprints + columnas en `Automation` + `AutomationExecution` + condiciones + política de contacto + **dry-run** + Admin "habilitar blueprint" | `Automation`, `AutomationExecution` | — | configuración inválida rechazada, cooldown, consentimiento, horario, idempotencia por evento | lógica en el lugar equivocado | Con dry-run se ve "se habría enviado a N" |
| | 6 | App | Despachador hacia n8n + callback + reintentos + workflows genéricos versionados en `n8n/workflows/` + documentación | — | `POST reymen-action-*`, `/api/webhooks/n8n/automation-executions` | firma, anti-replay, token por ejecución, timeout, backoff, transiciones idempotentes | n8n caído (cola crece pero no bloquea) | n8n apagado → ventas OK y reintentos al volver |
| | 7 | App | `/portal/automations`: estado, trigger, última ejecución, éxito/error, historial; Admin: dead letter y reintento | — | — | UI y permisos | — | El cliente ve sus automatizaciones sin ver n8n |
| **3. P0** | 8 | App | `inventory_low_alert` (no depende de clientes: primer piloto real del motor) | — | `inventory.low/critical` | episodio único, sin bloqueo de venta | ruido de alertas | Un aviso por insumo y nivel |
| | 9 | App | `daily_executive_report` (Reymen arma los datos; n8n entrega) | — | `report.daily_due` | cálculos y zona horaria | días sin ventas | Llega a la hora configurada con números que cuadran con Food |
| | 10 | App | `post_visit_feedback` + `CustomerFeedback` + formulario con token + alerta de feedback negativo | `CustomerFeedback` | `/f/[token]` | token de un solo uso, aislamiento | spam o abuso del link | Feedback negativo → alerta y seguimiento |
| | 11 | App | `second_visit` | — | `customer.second_visit_due` | una vez por cliente | — | — |
| | 12 | App | `customer_recovery` v1 (mediana de intervalos) | — | `customer.at_risk` | episodios y cooldown | pocos datos al inicio | Lista explicable de por qué cada cliente está en riesgo |
| | 13 | App | Atribución + "Ingresos asociados" por automatización (+ grupo de control opcional) | `AutomationTouch`, `AutomationConversion` | — | ventana, último contacto, una venta = una atribución, reversa por cancelación | sobreatribución | Cada peso atribuido tiene su rastro auditable |
| **4. P1** | … | ambos | VIP, cumpleaños (campo y captura), pronóstico de inventario (velocidad de consumo), orden de compra sugerida (aprobación humana), `shift.closed` desde el POS, reservaciones (requiere decidir producto), alertas de cancelaciones | | | | | |
| **5. P2** | … | App | Early Warning (z-score contra el mismo día de la semana, explicable), Smart Inventory Recovery (segmento elegible, sin descuentos automáticos), Next Best Action (reglas), AI Manager (un LLM **redacta** el brief sobre datos estructurados; no decide) | | | | | |

---

## I. Foundation mínima recomendada

PRs **1, 2, 4, 5 y 6**:
1. cliente en la venta, en App y POS;
2. outbox de eventos;
3. blueprints + ejecuciones + dry-run;
4. despachador y callback firmados.

Con eso, cada automatización nueva es un archivo de blueprint más sus pruebas, más (si hace falta) un workflow genérico de n8n que ya existe. El PR 7 (UI) puede ir en paralelo al 6.

## J. Decisiones que necesita el usuario antes de implementar

1. **Captura de cliente en el POS:**
   - Teléfono opcional en el cobro con casilla de consentimiento (recomendado).
   - Mejora: "¿Te mando tu ticket por WhatsApp?". Da al cliente una razón para dar su número y sube mucho la tasa de captura.
2. **`Customer` separado de `Lead`** (recomendado, por los límites y KPIs del CRM).
3. **Reloj:** cron del VPS cada 5 min (recomendado) vs. n8n Schedule.
4. **WhatsApp:**
   - ¿Qué número o proveedor usa Villa Gardenia en n8n?
   - Las plantillas de marketing requieren aprobación de Meta y opt-in, y cada conversación tiene costo.
5. **Aviso de privacidad** del restaurante para el texto de consentimiento (LFPDPPP).
6. **Reseñas:** ofrecer el link de reseña a todos los que respondan el feedback (recomendado y conforme a políticas).

---

## K. Decisiones del usuario (2026-10-05) y plan aprobado

**Respuestas a §J:**
1. **Captura en el POS:** teléfono opcional al cobrar, con nombre y casilla de consentimiento, más la opción "¿Te mando tu ticket por WhatsApp?". Aprobado tal como se propuso.
2. **`Customer` es un modelo nuevo**, separado de `Lead`. Aprobado.
3. **Reloj:** cron del VPS cada 5 min → `POST /api/cron/automations/tick` con `CRON_SECRET`. Aprobado.
4. **WhatsApp:** por ahora un número y proveedor **ficticios**. Los workflows de n8n se construyen genéricos y el envío real se conecta después. Mientras tanto, las automatizaciones corren en **dry-run** o contra un webhook de n8n de prueba.
5. **Aviso de privacidad: PENDIENTE** (Villa Gardenia no tiene uno).
   - El POS muestra un texto de consentimiento genérico **configurable por organización**, guarda la versión del texto aceptado y la fecha.
   - Hasta que exista el aviso, **no se envían mensajes de marketing reales**: solo dry-run, alertas internas y reporte al dueño.
6. **Reseñas:** el link de reseña se ofrece a **todos** los que respondan el feedback. Aprobado.

**Alcance agregado por el usuario:**
- **Descuentos en el POS.** Deben existir: por línea o por cuenta, en % o en monto, con motivo, y con autorización de admin o gerente si superan un límite. El evento lleva el descuento y Reymen lo guarda, lo que habilita después "alertas de descuentos" y el rubro del reporte diario.
- **Tiempos de cocina y cierre de turno deben llegar a Reymen.** Eventos nuevos del POS por el mismo outbox:
  - `kitchen.ticket_ready`: orden o línea, `sentAt`, `readyAt`, estación;
  - `shift.closed`: sesión de caja, esperado, contado, diferencia, ventas, propinas y quién cerró.
  
  Reymen los guarda (modelos `FoodKitchenTicket` y `FoodShiftClose`, o un `DomainEvent` con payload tipado) y habilitan `kitchen.sla_exceeded` y `shift.closed` en el motor.

**Orden de trabajo acordado** (PRs pequeños; cada uno con pruebas, CI en verde y squash):

| # | Repo | PR | Notas |
|---|---|---|---|
| 1 | App | `Customer` + estadísticas + `FoodSale.externalOrderId/customerId/cancelsSaleId` + webhook acepta `orderId`, `customer` (y `discount`) **opcionales** | Compatible con POS viejos. Ver §H PR 1 |
| 2 | POS | Captura opcional del cliente al cobrar (offline) + consentimiento configurable + `orderId` y `customer` en el evento y en el adaptador | Ver §H PR 2 |
| 3 | POS + App | **Descuentos** en el POS (permiso y límite) + campo `discountAmount` y motivo en el evento y en `FoodSale` | Nuevo |
| 4 | POS + App | Eventos `kitchen.ticket_ready` y `shift.closed` → endpoint en Reymen + modelos | Nuevo |
| 5 | App | Outbox `DomainEvent` + cron `tick` con candado | §H PR 4 |
| 6 | App | Blueprints en código + `Automation.blueprintKey/Version/dryRun` + `AutomationExecution` + política de contacto + dry-run + Admin "habilitar blueprint" | §H PR 5 |
| 7 | App | Despachador firmado hacia n8n + callback con token por ejecución + reintentos + workflows genéricos en `n8n/workflows/` (proveedor ficticio) | §H PR 6 |
| 8 ✅ | App | `inventory_low_alert` + actividad en `/portal/automations` (§P) |  |  |
| 9+ | App | P0: `daily_executive_report`, `post_visit_feedback`, `second_visit`, `customer_recovery`, atribución | §H PRs 7–13 |

**Siguiente paso exacto:** PR 1 (ReymenApp).
- Migración incremental `…_customers`: tabla `Customer` y columnas opcionales en `FoodSale`.
- `src/lib/customers.ts`: `normalizePhoneMx()` a E.164 (`+52…`), `upsertCustomerForSale()` y `rebuildCustomerStats()`.
- `processFoodPosOrder` (`src/lib/food.ts:1037`) acepta opcionalmente:
  - `orderId`;
  - `customer: { phone, name?, consent?: { accepted, textVersion, at } }`;
  - `discount: { amount, reason }`.
- Pruebas en `src/lib/customers.test.ts` y en el test del webhook POS.
- **Reglas:**
  - sin cliente, el comportamiento es idéntico al de hoy;
  - las estadísticas se actualizan en la misma transacción de la venta;
  - la cancelación (`order.cancelled`) resta la visita y el gasto del cliente.


## L. Eventos del POS implementados: cocina y cierres de turno (PR 4)

Mismo esquema de firma e idempotencia que `/api/webhooks/pos/orders` (HMAC con el secreto de la organización, `x-reymen-event-id`); sin el módulo Reymen POS responden 403 `pos_module_disabled` (el POS los deja pendientes).

- `POST /api/webhooks/pos/kitchen` — `kitchen.ticket_ready`: `{ orderId, orderNumber, tableName, branchId?, deviceCode?, items: [{ itemId, name, quantity, station, sentAt, readyAt }] }`. Guarda un `FoodKitchenTicket` por producto (idempotente por `itemId`); descarta tiempos imposibles (listo antes de enviarse o más de 24 h).
- `POST /api/webhooks/pos/shifts` — `shift.closed`: `{ sessionId, number, deviceCode?, branchId?, openedAt, closedAt, openedByName, closedByName, openingFloat, expected, counted, difference, salesTotal, salesCount, tips, cancelledTotal, cancelledCount, notes? }`. Guarda un `FoodShiftClose` por turno (la diferencia se recalcula como contado − esperado).
- Se ven en Foods → Operación (tiempos de preparación por estación y últimos cortes). Habilitan `kitchen.sla_exceeded` y `shift.closed` en el motor de eventos (PR 5).

## M. Bandeja de eventos y reloj implementados (PR 5)

- **`DomainEvent`** (migración `domain_events`): `type`, `subjectType/Id`, `occurredAt`, `payload`, `dedupeKey` (único por organización), `correlationId`, `causationId`, `status` (`PENDING`/`PROCESSED`/`FAILED`), `attempts`, `nextAttemptAt`, `error`.
- **Emisión** (`emitDomainEvent` en `src/lib/domain-events.ts`): es un `INSERT` dentro de la misma transacción del hecho. Hoy `processFoodPosOrder` emite:
  - `sale.completed` (llave `sale.completed:<orderId>`; sin `orderId` usa el id de la venta),
  - `sale.cancelled` (llave con el monto, para no fusionar cancelaciones parciales distintas),
  - `customer.created` (solo la primera vez que aparece ese teléfono).
  Si la venta falla no queda evento; si el POS reenvía el mismo pedido, no se duplica.
- **Reloj:** `POST /api/cron/automations/tick` (Bearer `CRON_SECRET`, falla cerrado). Un candado `pg_try_advisory_xact_lock` impide dos ticks simultáneos (el segundo responde `ran: false, reason: "locked"`). Cada tick procesa hasta 200 eventos pendientes y borra los procesados de más de 90 días.
- **Consumidores:** `registerDomainEventConsumer()` es el punto donde se conecta el motor de blueprints (PR 6). Un consumidor que lanza error deja el evento en reintento con espera de 1, 5, 30 min, 2 h y 12 h; al quinto fallo queda `FAILED` (visible para revisión). Sin consumidores, los eventos solo se marcan procesados.
- **Cron del VPS** (cada 5 minutos; usa el mismo `CRON_SECRET` que el reintento de webhooks):

```bash
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://app.reymen.mx/api/cron/automations/tick >/dev/null
```

## N. Blueprints, ejecuciones y dry-run implementados (PR 6)

- **Blueprint = código** (`src/lib/automation/blueprints/`): `key`, `version`, `trigger` (tipo de `DomainEvent`), `requiredModules`, `configSchema` (Zod con valores por defecto), `decide()` (función pura) y `contactRules()` (canal, enfriamiento, horas de silencio). El catálogo (`blueprints/index.ts`) es la fuente de verdad; una v2 se agrega junto a la v1.
- **Primer blueprint:** `welcome_new_customer` v1 — trigger `customer.created`, requiere el módulo Reymen POS, mensaje de bienvenida solo con consentimiento. Configuración: `channel` (`whatsapp`/`sms`), `cooldownDays` (365), horas de silencio 21:00–09:00 (hora del negocio).
- **Instancia = `Automation`** con `blueprintKey`, `blueprintVersion`, `trigger`, `dryRun` (por defecto **true**), `lastRunAt`, `lastStatus`; una por organización y blueprint. Las automatizaciones n8n heredadas (sin `blueprintKey`) no cambian.
- **Motor** (`src/lib/automation/engine.ts`), consumidor de la bandeja que corre el `tick`: por cada evento busca las automatizaciones ACTIVAS de esa organización con ese trigger y crea una `AutomationExecution` (única por automatización + evento):
  - `SKIPPED` con `skipReason`: `blueprint_unavailable`, `module_disabled`, `invalid_config`, `no_customer`, `no_consent`, `cooldown`, `quiet_hours` o la que decida el blueprint;
  - `DRY_RUN`: "se habría enviado a…" con la acción completa (canal, plantilla, destinatario) y sin contactar a nadie;
  - `PENDING`: con el dry-run apagado, queda lista para el despachador (PR 7).
- **Política de contacto** (`policy.ts`, única para todos los blueprints): consentimiento aceptado, enfriamiento por cliente y automatización, y horas de silencio en la zona horaria de la organización.
- **Admin:** Admin → Cliente → "Automatizaciones (blueprints)": habilitar (exige los módulos del blueprint; nace en dry-run), pasar a envío real (con confirmación), pausar/reanudar y ver el conteo de ejecuciones por estado. Todo queda en la bitácora de auditoría (`automation.blueprint_*`).
- **Pendiente de PR 7:** enviar las ejecuciones `PENDING` a n8n (firmado, con reintentos) y recibir el resultado.

## O. Despachador y callback implementados (PR 7)

- **Despachador** (`src/lib/automation/dispatcher.ts`), parte del `tick`: toma hasta 20 ejecuciones `PENDING` (solo existen con el dry-run apagado) cuyo reintento ya toca, las firma y las envía a `{N8N_BASE_URL}/webhook/reymen-action-message` con timeout de 5 s.
  - Éxito → `DISPATCHED`. Fallo → reintento con espera de 1, 5, 30 min, 2 h y 12 h; al quinto fallo `FAILED`.
  - Si la automatización se pausó o volvió a simulación antes de enviar, no se envía. Un mensaje con más de 24 h sin salir se omite (`expired`).
  - Sin `N8N_BASE_URL`/`N8N_WEBHOOK_SECRET` no se intenta nada. n8n caído nunca bloquea ventas ni eventos.
- **Callback** `POST /api/webhooks/n8n/automation-executions`: firma de plataforma + token por ejecución (HMAC), transiciones idempotentes. Contrato completo en `docs/automations/N8N.md`.
- **Workflow genérico** `n8n/workflows/reymen-action-message.json` con proveedor ficticio.

## P. `inventory_low_alert` y avisos internos implementados (PR 8)

- **Evento `inventory.level_changed`:** `applyStockMovements` (único lugar que mueve existencias) lo escribe en la misma transacción **solo cuando un movimiento empeora el nivel** del insumo: `ok → low`, `low → critical` u `ok → critical`. Quedarse igual o mejorar no avisa; al recuperarse y volver a bajar empieza un episodio nuevo. Es un INSERT: nunca bloquea una venta. Insumos desactivados no avisan.
  - Niveles (`stockLevel`): **bajo** = existencia ≤ mínimo; **crítico** = ≤ 0 o ≤ 25 % del mínimo. Sin mínimo configurado, solo alerta al agotarse.
  - Payload: `inventoryItemId`, `name`, `unit`, `level`, `previousLevel`, `currentStock`, `minStock`, `branchId`, `movementType`.
- **Blueprint `inventory_low_alert` v1:** `audience: "internal"`, requiere Reymen Foods, config `minLevel` (`low` | `critical`, por defecto `low`). Acción `{ type: "alert", severity, title, body, href }`.
- **Audiencia interna en el motor:** no hay cliente ni política de contacto. Con dry-run se registra `DRY_RUN` ("se habría avisado"); sin dry-run la ejecución queda `SUCCEEDED` al instante (el aviso **es** el registro) y no pasa por el despachador ni por n8n.
- **Dónde se ve:** la campana del portal (avisos de los últimos 3 días, solo los reales, no los simulados) y "Actividad de las automatizaciones inteligentes" en `/portal/automations` (qué hizo cada automatización o por qué se omitió).
- **Habilitar:** Admin → Cliente → Automatizaciones (blueprints) → Alerta de inventario bajo (nace en dry-run).
- **Siguientes (PR 9+):** `daily_executive_report`, `post_visit_feedback`, `second_visit`, `customer_recovery`, atribución (§E–F).

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

## Q. `daily_executive_report` y detectores del reloj implementados (PR 9)

- **Detector del reloj** (`src/lib/automation/detectors.ts`, corre en cada `tick` antes de procesar la bandeja): para cada automatización ACTIVA con trigger `report.daily_due`, si en la zona del negocio ya pasó `sendHour` (por defecto 8:00), arma el reporte del **día local anterior** y deja **un solo evento por día** (`dedupeKey = report.daily_due:YYYY-MM-DD`; antes de armarlo comprueba que no exista, así el tick cada 5 min no recalcula).
- **Reporte** (`report.ts`, `buildDailyReport`): ventas brutas y netas, tickets, ticket promedio, cancelaciones (ventas en negativo), comparativo contra el día anterior y contra el mismo día de la semana pasada, top 5 productos, stock crítico (+ cuántos están bajo su mínimo) y merma (`WASTE`) del día. Los días se miden en la zona horaria de la organización (`zonedDayStart`).
- **Blueprint `daily_executive_report` v1:** audiencia interna, requiere Reymen Foods, config `sendHour`. Acción `{ type: "report", title, date, report }`.
- **Entrega** (`internal-delivery.ts`): sin dry-run, el motor marca la ejecución `SUCCEEDED` y manda el correo (`dailyReportEmail`) a los usuarios activos con rol **OWNER o MANAGER**; un correo que falla no tumba el evento. Con dry-run solo se registra. El reporte también queda en la actividad de `/portal/automations` y la campana avisa "Reporte diario listo".
- **Pendiente:** entrega por WhatsApp vía n8n (hoy solo correo; requiere `RESEND_API_KEY`).

## R. `second_visit` y `customer_recovery` implementados (PR 10)

Ambas usan los detectores del reloj (`detectors.ts`): el `tick` busca candidatos, deja **un evento por hecho** (llave única; solo se emiten los que aún no existen) y el motor aplica la política de contacto de siempre (consentimiento, enfriamiento, horas de silencio) y el dry-run. Requieren el módulo Reymen POS. Reglas puras en `customer-signals.ts`.

- **`second_visit` v1** (evento `customer.second_visit_due`): cliente con **una sola visita**, consentimiento aceptado, con su primera visita entre `afterDays` (14) y `maxDays` (60) atrás. Una vez por cliente (`dedupeKey = customer.second_visit_due:<cliente>`). Plantilla `second_visit_v1` (`name`, `businessName`). Si regresó antes de procesarse → `already_returned`.
- **`customer_recovery` v1** (evento `customer.at_risk`): cliente con `visitCount ≥ minVisits` (3) cuya ausencia pasa de `max(minDays = 21, factor = 2.5 × su intervalo mediano entre visitas)` sin llegar a `maxDays` (180, después ya no se le insiste). El intervalo es la **mediana** de los días entre visitas (varias compras el mismo día cuentan una). Un episodio por ausencia (`dedupeKey = customer.at_risk:<cliente>:<última visita>`): si regresa y se vuelve a alejar, es otro. Enfriamiento de 60 días. Plantilla `customer_recovery_v1` (`name`, `businessName`, `daysSince`). Si regresó antes de procesarse → `already_returned`.
- **Protección al encenderlas:** las ventanas `maxDays` evitan mensajes masivos a clientes de hace años; los candidatos se toman en lotes de 200 por tick.
- **Pendiente:** dar de alta las plantillas `second_visit_v1` y `customer_recovery_v1` en el proveedor de WhatsApp (Meta) antes de pasar a envío real.

## S. `post_visit_feedback` implementado (PR 11)

- **Blueprint `post_visit_feedback` v1:** trigger `sale.completed` (con cliente y consentimiento), requiere Reymen POS. Config: `delayMinutes` (120), `cooldownDays` (7), horas de silencio, `reviewUrl` (https, opcional). Plantilla `post_visit_feedback_v1` (`name`, `businessName`, `feedbackUrl`).
- **Retraso en el motor:** `contactRules.delayMinutes` programa el envío (`nextAttemptAt` y `action.sendAfter`) = evento + retraso; si cae en horas de silencio se mueve a la primera hora permitida (`nextAllowedTime`). El despachador no envía antes y su plazo de 24 h cuenta desde `sendAfter`.
- **`Blueprint.prepare`:** hook asíncrono del motor que completa la acción antes de registrar la ejecución (aquí crea la solicitud y su enlace); en dry-run no escribe nada.
- **Modelo `CustomerFeedback`:** una solicitud por venta (`organizationId + saleId` único), con `token` aleatorio de 48 hex. Estados `REQUESTED → ANSWERED | OPEN → RESOLVED`.
- **Formulario público** `/feedback/<token>` (sin cuenta; la ruta es pública en `proxy.ts`, `noindex`): calificación 1–5 y comentario opcional (máx. 1000). Solo cuenta la primera respuesta (el UPDATE exige `REQUESTED`); límite de intentos por enlace y por IP. Responde directo a la base: no se interpreta texto libre de WhatsApp.
- **Calificación ≤ 3** (`LOW_SCORE_MAX`): el caso queda `OPEN`, se avisa por correo a dueños y gerentes y aparece en la campana y en "Opiniones por atender" de `/portal/automations`, donde el equipo lo cierra con una nota (`RESOLVED`, rol con `conversations:resolve`).
- **Reseñas sin manipulación:** la invitación a la reseña pública (`reviewUrl`) se ofrece a **todos** los que responden, sin condicionarla a la calificación.
- **Admin:** `/admin/automations` ahora muestra el catálogo de blueprints y en qué clientes están encendidos (con enlace); se habilitan desde el cliente.
- **Pendiente:** dar de alta la plantilla `post_visit_feedback_v1` en el proveedor de WhatsApp antes de pasar a envío real.

## T. Un solo catálogo y aviso de solapamiento con plantillas n8n

- **Catálogo único** en Admin → Automatizaciones: blueprints (lógica en la app) y plantillas de n8n (marketplace) juntos, por categoría, con su etiqueta "Blueprint · app" / "Plantilla · n8n", cuántos clientes lo usan y enlace al lugar donde se gestiona. Abajo quedan las automatizaciones n8n ya instaladas.
- **Solapamiento:** cada blueprint declara `overlapCategories` (categorías de `AutomationTemplate` con un trabajo parecido: `onboarding` → bienvenida, `retention` → segunda visita y recuperación, `follow_up` → feedback, `notifications` → alertas y reporte). Si el cliente tiene una plantilla ACTIVA de esa categoría, el panel del blueprint muestra un aviso y **pasar a envío real exige confirmarlo** (`acknowledgeOverlap`, validado también en el servidor). Habilitarlo en simulación no se bloquea: no contacta a nadie.
- Pendiente (necesita datos de producción): revisar qué plantillas tienen instaladas los clientes con POS y retirar o marcar las equivalentes.

## U. Atribución de ingresos implementada (PR 12)

- **Contacto (`AutomationTouch`):** al llegar el callback de n8n `sent` o `delivered` de una ejecución de **mensaje** a un cliente (`recordTouchForExecution`). Los `failed`/`skipped` y los avisos internos no cuentan. Idempotente por ejecución. Ventana: `ATTRIBUTION_WINDOW_DAYS` = 7.
- **Conversión (`AutomationConversion`):** el consumidor `attributeEvent` (en el `tick`, junto al motor) atribuye cada `sale.completed` al **último** contacto del cliente que sea **anterior** a la venta y cuya ventana siga abierta. Una venta cuenta como máximo para **una** automatización (`organizationId + saleId` único). Se guarda el monto **neto**, `saleAt`, el contacto, la ejecución y la versión de la regla (`ruleVersion`).
- **Exclusiones:** contactos fallidos o no entregados, ventas sin cliente o en negativo y ventas anteriores al envío (incluido el mismo día).
- **Cancelaciones:** `sale.cancelled` resta su monto neto a la conversión de la venta original; si llega a cero queda `revertedAt`/`revertedBySaleId` (la fila **no se borra**).
- **Pantalla:** "Ingresos asociados a automatizaciones" en `/portal/automations` (30 días: mensajes enviados, ventas e ingresos asociados por automatización, sin revertidos), con el aviso de que son ingresos **asociados** y no prueba de que la automatización los provocó.
- **Pendiente (recomendado):** grupo de control aleatorio por automatización (p. ej. 10 % sin mensaje) para medir la diferencia de tasa de regreso, que es la prueba real de causalidad; `couponId` cuando existan cupones.

## V. Configuración de blueprints por cliente en el Admin

- **Formulario generado desde el esquema:** cada blueprint declara `configUi` (presentación de cada parámetro: título, ayuda, sección, unidad y etiquetas de opciones); límites, valores por defecto y opciones salen de su `configSchema` (Zod). Una prueba exige que **ningún parámetro quede sin presentación**, así nada configurable se queda fuera de la pantalla.
- **Secciones:** Cuándo actúa · A quién · Canal y horario · Límites · Opcionales (`CONFIG_GROUPS`). Cada campo muestra su valor de fábrica, marca "Modificado" y permite restaurarlo (por campo o todo).
- **Admin → Cliente → Automatizaciones (blueprints) → Configurar** (`BlueprintConfigDialog`). Muestra la zona horaria del negocio (de ella dependen las horas) y avisa si la automatización está en envío real (los cambios aplican de inmediato).
- **Servidor** (`getAutomationConfigForm`, `saveAutomationConfig`, ver §AA): solo admin, aislado por organización; ignora llaves desconocidas; valida con el esquema (límites) y con `crossCheck` (coherencia, p. ej. "mínimo sin venir" < "darlo por perdido"); devuelve errores por campo (sin guardar nada si hay alguno); guarda solo lo que cambió y lo deja en la bitácora (`automation.config`, antes y después).
- El panel de blueprints del cliente ahora ocupa todo el ancho, tiene ancla `#blueprints` y un enlace desde la tarjeta "Automatizaciones".

## W. Ejecuciones, errores y conversiones por cliente en el Admin

- **Pantalla** `/admin/clients/<id>/automations` (enlace "Ver ejecuciones y errores" en el panel de blueprints): tarjetas de resumen (ejecuciones, fallidas, mensajes enviados, ventas e ingresos asociados), filtros por automatización, estado y periodo (7/30/90 días), listado paginado y, por ejecución, "Seguir la cadena": evento (tipo, id, correlación) → ejecución (intentos, próximo intento) → envío a n8n → resultado (id del proveedor) → contacto registrado → venta asociada.
- **Etiquetas compartidas** (`labels.ts`): estados y razones de omisión en una sola copia para el portal y el Admin.
- **Reintento manual** (`retryExecution`): solo ejecuciones **FAILED** y solo cuando es seguro (`retryEligibility`): acción de mensaje, **sin id de mensaje del proveedor** (podría duplicarse), automatización activa y en envío real, cliente existente y **con consentimiento vigente**. Vuelve a `PENDING` con intentos en cero y un plazo nuevo (`sendAfter` = ahora, para que no caduque por la antigüedad); respeta las horas de silencio del blueprint; el UPDATE exige que siga `FAILED` (dos clics no la duplican); queda en la bitácora (`automation.execution_retry`). Solo admin, aislado por organización.

## X. Avisos internos por n8n (WhatsApp y correo)

- **Workflow genérico** `reymen-action-notify` y tipos de acción `alert` / `report` en el mismo despachador (`ACTION_WORKFLOW`). Contrato en `docs/automations/N8N.md`.
- **Reymen decide a quién y qué** (`notify.ts`): destinatarios = dueños y gerentes activos (correo) y el WhatsApp del responsable (E.164) según el parámetro `notify` (`app` | `email` | `whatsapp` | `email_whatsapp`) y `whatsappTo` de la automatización; asunto, texto y HTML armados en la app. Con "solo la campana" la ejecución queda `SUCCEEDED` sin pasar por n8n; con destinatarios externos queda `PENDING` hasta que el despachador la entrega y llega el callback. En dry-run: `DRY_RUN` con los destinatarios que se habrían avisado.
- **Una sola ruta de entrega:** se retiró el envío directo de correos desde la app (`internal-delivery`, `feedbackAlertEmail`). La calificación baja crea su ejecución (`subjectType: feedback`) con el mismo mecanismo.
- **Admin:** "Avisar además por" y "WhatsApp del responsable" en Configurar (con validación: WhatsApp exige número internacional); el reintento manual también cubre avisos fallidos sin id de proveedor. La campana muestra los avisos aunque la entrega externa esté pendiente o haya fallado.

## Y. Grupo de control para la atribución (PR 14)

- **Parámetro `controlGroupPct`** (0–50, por defecto **0 = apagado**) en los blueprints de mensajes a clientes (`welcome_new_customer`, `second_visit`, `customer_recovery`): Admin → Configurar → Opcionales → "Grupo de control". Lo habitual es 10.
- **Asignación determinista y estable** (`isControlGroup`: hash de automatización + cliente): el mismo cliente siempre cae en el mismo grupo para esa automatización y nadie puede "elegir" a quién medir. Solo entran **clientes elegibles** (después de consentimiento, enfriamiento y horas de silencio): la ejecución queda `SKIPPED` con razón `control_group` y **no se les escribe a propósito**. Cuenta para el enfriamiento (el control no se re-evalúa más veces que los tratados). También aplica en dry-run.
- **Prueba de incrementalidad** (`computeLift`, Admin → ejecuciones): tasa de regreso (alguna compra en los 7 días siguientes) de quienes recibieron el mensaje contra el control, con clientes, regresaron, tasa, gasto por cliente y diferencia en puntos. **Con menos de 30 clientes por grupo se marca "muestra insuficiente"** y no se saca conclusión. No es atribución: es la tasa de regreso de cada grupo, la prueba de causalidad que la atribución por último contacto no da.

## Z. Cumpleaños y VIP (P1, con los datos que ya hay)

- **Dato nuevo, mínimo:** `Customer.birthMonth` / `birthDay` (solo día y mes; **sin año ni edad**). Se guarda **solo si el cliente aceptó el contacto** (en esa misma captura o antes); si no hay consentimiento, se ignora. Entra por el webhook del POS (`customer.birthday` como `"MM-DD"`, `"YYYY-MM-DD"` —el año se descarta— o `{month, day}`; un valor mal formado se ignora sin tirar la venta) y el equipo lo captura o borra en **Clientes** (`setCustomerBirthday`: permiso `food:manage`, misma organización, bitácora). El POS aún no lo pide al cajero: el campo queda listo en la API.
- **`birthday_campaign`** (cliente; trigger `customer.birthday`): el detector del reloj emite **un evento por cliente y año** (`customer.birthday:<id>:<año>`) el día del cumpleaños en la zona del negocio, desde la hora `sendHour` (10). Quien nació un 29 de febrero se felicita el 28 en años no bisiestos. Pasa por la política de contacto de siempre (consentimiento, enfriamiento 300 días, horas de silencio) y admite grupo de control. Plantilla de WhatsApp `birthday_campaign_v1` (variables `name`, `businessName`) pendiente de aprobar en Meta.
- **`vip_customer_alert`** (interno; trigger `customer.vip`): avisa al equipo (campana, y opcionalmente correo/WhatsApp) cuando un cliente alcanza **visitas Y gasto** mínimos (5 y $3,000 por defecto, configurables). Para no soltar una avalancha al encenderla, el detector solo considera a quien ya cumple el umbral **y visitó en los últimos 3 días** (esa visita lo hizo VIP); un evento por cliente. No le escribe al cliente, así que no exige consentimiento. Si la configuración sube el listón antes de procesarse, se omite (`not_vip`).
- **Pendiente de P1:** `customer.segment_changed`, y capturar el cumpleaños en el POS (ReymenPOS).

## AA. Plantillas n8n genéricas y configurables (PR 15: parámetros y config única)

- **Qué problema resuelve:** un workflow de n8n no debe llevar horarios, plantillas, teléfonos ni enlaces de un cliente dentro; Reymen guarda esos valores por cliente y los entrega al workflow (§AB). Así **un mismo workflow sirve a todos los clientes**.
- **Mismo generador de formularios:** cada versión de plantilla declara sus parámetros en `TemplateVersion.configSpec`, con el **mismo formato de presentación que los blueprints** (grupo, título es/en, ayuda, unidad, opciones) más lo que en un blueprint dice el esquema Zod (tipo, mínimo/máximo, entero, valor de fábrica, obligatorio, longitud). `compileConfigSpec` lo convierte en esquema + presentación y desde ahí **todo es el mismo código**: `describeConfig`, `AutomationConfigDialog`, validación con errores por campo, valores de fábrica y restaurar. Tipos: `number`, `hour`, `select`, `url`, `phone`, `text`. La declaración se valida al crear la versión (llaves, límites coherentes, opciones, valor de fábrica que cumpla su propio esquema).
- **Un solo lugar para la configuración:** `Automation.config`. Se retiró `TemplateInstallation.config` (la migración copia lo que solo estuviera ahí). Al instalar, la config se completa con los valores de fábrica y se valida con el mismo esquema. `TemplateVersion.defaultConfig` (JSON libre que nada leía) queda como columna heredada sin uso desde la interfaz; se retirará cuando se confirme que no hay datos útiles.
- **Una sola pareja de acciones para ambos tipos:** `getAutomationConfigForm` / `saveAutomationConfig` (por `automationId`, solo admin, aislado por organización); reemplazan a las que eran solo de blueprints. En Admin → Cliente aparece **Configurar** en cada plantilla instalada cuya versión declara parámetros.
- **Campo marcado `ownerEditable`:** es el subconjunto que el dueño edita desde su portal (§AC); encender el envío real sigue siendo solo del admin.

## AB. Entrega de la configuración a n8n (PR 16)

- **Reymen es la dueña de la configuración;** n8n la recibe, no la guarda. `buildAutomationEnvelope` arma el mismo contenido (`organizationId`, `automationId`, `configuration`, `missingRequired`, plantilla) para las dos vías: **por evento** (`triggerAutomationWorkflow`: va dentro del cuerpo firmado, solo a automatizaciones activas) y **por consulta** (`POST /api/webhooks/n8n/automation-config`, firma de plataforma, aislado por organización, `404` uniforme). Contrato en `docs/automations/N8N.md`.
- **Qué NO hace:** no cambia las automatizaciones heredadas ni el despachador de blueprints (que ya entrega todo lo necesario en cada acción). Los workflows genéricos de integración (captura de leads, agenda, recordatorios) son los que consumen esta configuración.

## AC. Parámetros editables por el dueño y criterio blueprint vs n8n (#55-C y #55-D)

- **El dueño ajusta lo seguro desde su portal.** En Automatizaciones, cada tarjeta con al menos un parámetro `ownerEditable` muestra **Ajustar**; abre la misma pantalla de parámetros del Admin (`AutomationConfigDialog`) pero solo con esos campos (`getOwnerConfigForm` / `saveOwnerConfig`, requieren `settings:manage` y el módulo Automatizaciones, aisladas por organización). Hoy son editables: **horario de silencio** (`quietStart`, `quietEnd`) y el **enlace de reseña** de `post_visit_feedback`. Cuándo actúa, a quién escribe, los límites y **pasar a envío real** siguen siendo del admin: intentar cambiar un parámetro que no es del dueño es un error (no se ignora en silencio) y la acción nunca toca el estado ni `dryRun`. Cada cambio queda en la bitácora (`automation.config`, `by: owner`, antes y después). En el Admin, esos campos llevan la etiqueta «El dueño puede editarlo».
- **Criterio blueprint vs n8n.** *Reymen decide QUÉ ocurre; n8n decide CÓMO se ejecuta la integración externa.* Si la automatización **decide a quién escribir y cuándo** (retención, seguimiento, bienvenida) o arma un aviso interno (alertas y reportes) → **blueprint** (`DECISION_CATEGORIES`). Si solo **conecta algo externo** (captura de leads, agenda, recordatorios, CRM) → **plantilla genérica de n8n** (`INTEGRATION_CATEGORIES`), configurada por Reymen (§AA/§AB). `blueprintsCovering(categoría)` dice qué blueprints cubren una categoría; una prueba exige que toda categoría de decisión tenga equivalente.
- **Qué cambió en el Admin:** en el catálogo único, una plantilla de una categoría de decisión muestra el aviso de que ya existe como blueprint (y cuál). Se suma al aviso de solapamiento de §T, que sigue exigiendo confirmar el paso a envío real.
- **Pendiente (necesita datos de producción):** revisar qué plantillas de decisión tienen instaladas los clientes con POS y retirarlas cuando su blueprint equivalente esté en envío real. No se retira nada automáticamente.

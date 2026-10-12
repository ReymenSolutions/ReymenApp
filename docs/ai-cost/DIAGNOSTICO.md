# IA y Consumo — diagnóstico de arquitectura y plan P0/P1/P2

> **Estado:** P0 implementado (ledger, tarifas, gateway que mide, Admin → IA y Consumo). Decisiones de §5 confirmadas por el usuario. Ver §6.

Estado al 2026-10-12. Solo lectura del repositorio; nada de esto está implementado todavía.

## 1. Qué existe hoy (y se reutiliza)

| Necesidad | Lo que ya hay | Decisión |
|---|---|---|
| Llamadas a IA | **Un solo punto**: `callClaude` / `generateText` en `src/lib/ai-draft.ts` (SDK de Anthropic, `ANTHROPIC_API_KEY` global, modelo por `AI_DRAFT_MODEL`). Lo usan los borradores (`ai-draft.ts`), el modo Automático (`ai-auto-reply.ts`), el pipeline con IA (`ai-pipeline.ts`) y el Probador/vista previa (`agent.ts`). **n8n no llama a ningún LLM** (el AI Lab dejó de usar n8n). | El gateway se construye **encima de ese punto único**: no hay llamadas dispersas que migrar. |
| Uso registrado | Solo `ReplyDraft.inputTokens/outputTokens/model`. No hay tenant-ledger, caché, costo, proveedor ni conversaciones con varias llamadas contabilizadas. | Falta: **ledger** (nuevo). `ReplyDraft` se conserva como dato de producto, no como contabilidad. |
| Proveedores | Solo Anthropic. | Abstracción `AiProvider` con Anthropic y OpenAI; la integración actual se conserva como adaptador. |
| "Agente" | No existe una entidad Agente. Lo más cercano: `AgentChannelSetting` (modo Apagado/Sugerir/Automático **por canal**) y el agente de pipeline. | Definir "agente" como `agentKey` = `inbox:<canal>` o `pipeline` (decisión §5). "Agentes IA activos" del plan = agentes con modo ≠ Apagado. |
| Planes | `Organization.plan` (`starter`/`professional`/`business` (antes `enterprise`)), constantes en código: `PLAN_LIMITS`, `PLAN_PRICES_MXN` (actualizados a 999/1,999/3,999 MXN), `PLAN_MODULES`; precio pactado por cliente `customMonthlyPriceMxn`; **módulos** como derechos aparte (`OrganizationModule`). Sin versionado. | Se **extiende** (catálogo en base de datos, versionado) en lugar de crear otro; los planes actuales se migran como versión 1. |
| Pagos | Stripe: checkout solo de `professional`, webhooks de suscripción (`/api/webhooks/stripe`). Sin recargas ni historial de pagos propio. | Recargas P1 reutilizan Stripe + el mismo patrón de webhook idempotente. |
| Tipo de cambio | `exchange-rate.ts` (Banxico → Frankfurter → env, caché en memoria). No guarda historial. | El ledger **guarda el tipo de cambio y su fecha usados en cada registro**. |
| Notificaciones | `notifyAdmins` (correo a admins), campana del portal alimentada por ejecuciones, n8n genérico de avisos. | Alertas 50/75/90/100 % usan estas rutas; sin un sistema nuevo. |
| Scheduler | `POST /api/cron/automations/tick` (cada 5 min, con candado). | Cierres/alertas de presupuesto se enganchan a ese tick; **no** se crea otro scheduler. |
| Auditoría / RBAC | `logAudit`, `can()`, `requireAdmin` (SUPER_ADMIN/ADMIN). | Se reutilizan. Costos mayoristas y presupuestos: solo admin. |
| Zona horaria / ciclo | `Organization.timezone`; el ciclo de Stripe no se guarda. | Se agrega ancla de ciclo de facturación por organización. |

## 2. Qué falta de verdad

1. Ledger de uso de IA por tenant (inmutable, idempotente, decimal).
2. Tabla de tarifas versionada (proveedor/modelo, precios por tipo de token, vigencia, fuente).
3. Gateway: autorización de tenant, validación de plan, reserva de presupuesto con concurrencia, registro final, política de degradación, auditoría.
4. Presupuestos por tenant y ciclo; alertas idempotentes; políticas al 100 %.
5. Catálogo de planes en base de datos con capacidades configurables y versionado.
6. Pantallas: Admin "IA y Consumo", detalle de tenant con costos, portal "Mi consumo de IA".
7. Recargas/excedentes con registro financiero compensatorio.
8. Entrada del gateway para n8n y POS (endpoint firmado, sin exponer llaves).

## 3. Plan por fases

### P0 — medir (nada de cobro ni recargas todavía)
Dependencias en orden:
1. **Modelo de datos y migraciones** (incrementales): `AiRate` (tarifas), `AiUsage` (ledger), `AiBudgetReservation`. Sin tocar tablas existentes salvo ancla de ciclo.
2. **Cálculo de costos** (puro, con `Decimal`): tokens de entrada, salida, caché lectura/escritura, razonamiento → costo en moneda original → MXN con tipo de cambio y fecha guardados; costo **estimado** vs **confirmado**.
3. **Gateway v0** sobre `generateText`: registra cada llamada (idempotente por `requestId`, reintentos sin duplicar, errores y llamadas parciales); agrupa por conversación/automatización/agente. Todavía **no bloquea ni reserva**: solo mide (las reservas de presupuesto llegan con los presupuestos, en P1).
4. **Instrumentación** de los 4 llamadores (borradores, automático, pipeline, probador) para pasar `tenantId`, `agentKey`, `conversationId`, origen.
5. **Admin → IA y Consumo (básico)**: resumen global, por tenant, por agente/modelo, historial, filtros, CSV; solo datos reales.
6. **Pruebas**: exactitud decimal, aislamiento entre tenants, idempotencia, concurrencia, reintentos.

Riesgo: tarifas. **No se inventan precios**: la tabla de tarifas se carga desde Admin (con fuente y vigencia) y, sin tarifa, el costo queda marcado "sin tarifa" en lugar de estimarse como cierto.

### P1 — comercial
1. Catálogo de planes en BD, versionado (v1 = los actuales); entitlements por plan: agentes IA activos (1/3/5), reserva interna IA (75/200/500 MXN), analítica, recargas, BYOK; planes personalizados por tenant sin alterar el catálogo.
2. Presupuestos y motor de uso justo: reserva atómica (concurrencia), alertas 50/75/90/100 %, política al 100 % configurable (bloquear no esencial / modelo económico autorizado / capacidad adicional / excepción administrativa auditada), escalamiento a humano. CRM/POS deterministas nunca se bloquean.
3. Detalle de tenant (costo real, margen de contribución **separado** del neto, sin inventar costos faltantes) y portal **Mi consumo de IA** (solo datos comerciales).
4. Gateway para n8n/POS (endpoint firmado reutilizando HMAC existente).
5. Recargas con Stripe: webhook idempotente, solo se acredita con pago confirmado, asientos compensatorios; recarga manual solo admin con permiso.

### P2 — escala
BYOK empresarial (credenciales aisladas y cifradas), routing de modelos, optimización por agente, conciliación contra facturas del proveedor, predicción y recomendaciones.

## 4. Riesgos y migraciones

- Cambiar el contrato de un cliente vigente: el catálogo versionado se migra como v1 idéntico; los cambios entran como v2 y solo se asignan por decisión explícita.
- `Organization.plan` sigue siendo la llave de compatibilidad; no se renombran planes.
- Doble contabilidad: el ledger es la única fuente de costo; `ReplyDraft` no suma.
- Stripe: el precio de `professional` debe recrearse en MXN (fuera de código).
- Despliegue: migraciones incrementales (`migrate deploy`); sin `reset` ni `push`.

## 5. Decisiones que necesito de ti

1. **Agente** = `inbox:<canal>` o `pipeline`, activo si su modo ≠ Apagado (propuesta). ¿Contamos así los "1 / 3 / 5 agentes"?
2. Nombres: usamos `starter` / `professional` / `business` con los precios 999 / 1,999 / 3,999 (ya aplicado).
3. Comportamiento por defecto al 100 %: propuesta = el agente pasa de Automático a **Sugerir** (la persona sigue respondiendo), se bloquean llamadas no esenciales del pipeline y se avisa al admin; CRM/POS siguen normales.
4. Ciclo de facturación: ¿mensual desde la fecha de alta del cliente (propuesta) o desde la fecha de suscripción de Stripe cuando exista?

## 6. Implementación del P0 (hecho)

- **Datos:** `AiRate` (tarifas inmutables y versionadas), `AiUsage` (ledger por tenant, único por `organizationId + requestId`). Migración `20261104090000_ai_usage_ledger`.
- **Gateway** (`src/lib/ai/gateway.ts`): `runAiCall` registra PENDING → SUCCEEDED/FAILED/REFUSED con tokens (entrada, salida, caché lectura/escritura, razonamiento), tarifa usada, tipo de cambio y fecha, costo original y en MXN. Sin tarifa vigente el costo queda **"sin tarifa"** (nunca inventado). Misma llamada lógica = no se vuelve a llamar ni a cobrar. No guarda prompts ni respuestas.
- **Proveedores** (`src/lib/ai/providers`): Anthropic (el existente, movido) y OpenAI (por `fetch`; **probado solo con respuestas simuladas, no contra la API real**). `AI_PROVIDER` elige; `AI_OPENAI_MODEL` y `OPENAI_API_KEY` para OpenAI.
- **Instrumentación:** borradores, modo Automático, pipeline con IA y Probador pasan por el gateway con tenant, agente (`inbox:<canal>` | `pipeline` | `probador`), conversación y origen.
- **Admin → IA y Consumo** (`/admin/ai`): costo MXN/USD, llamadas, costo por conversación, tokens, evolución diaria/semanal/mensual, consumo por cliente/agente/modelo, historial, carga de tarifas, CSV; filtros por cliente, agente, modelo, proveedor, periodo y operación. Solo admin.
- **Pendiente de P0:** cargar las tarifas reales desde Admin (con su fuente y vigencia) para que aparezcan costos; sin ellas se ven tokens y "sin tarifa".
- **Aún NO hecho (P1):** presupuestos por plan, alertas 50/75/90/100 %, reservas, políticas de uso justo, portal "Mi consumo de IA", detalle de costos en el tenant, recargas, gateway para n8n/POS.

## 7. Hard Budget Limit por tenant (P1, hecho)

Reutiliza el gateway (`src/lib/ai/gateway.ts`), la auditoría (`logAudit`) y las notificaciones existentes; no hay sistemas paralelos.

- **Presupuesto mensual por tenant** (`AiBudgetSetting`, editable en Admin → Cliente → Presupuesto de IA). Sin configuración rige el del plan (`PLAN_AI_BUDGET_MXN`: 75 / 200 / 500; saldrá del catálogo de planes cuando éste viva en la base de datos). **Nunca ilimitado.**
- **Ciclo** mensual anclado al día de alta del cliente (`billingCycle`, zona horaria del negocio; ancla tope 28). Al renovarse, el consumo del ciclo arranca en cero y el historial (uso y ajustes) se conserva.
- **Reserva + candado:** antes de llamar al modelo el gateway reserva el **peor costo posible** de la llamada (entrada estimada por tamaño + toda la salida permitida) dentro de una transacción con candado por tenant (`pg_advisory_xact_lock`). Las solicitudes simultáneas ven lo gastado **más** lo reservado: nunca suman más de lo disponible. Las reservas se liberan al registrar el costo real y vencen solas (5 min) si algo se cae a medias. Por ser el peor caso, bloquea cuando el restante no cubre la siguiente llamada (lado seguro).
- **Bloqueo al 100 %** solo de ese tenant: la llamada no se hace y queda `BLOCKED` (`BUDGET_EXHAUSTED`); sin tarifa (`NO_RATE`) o sin tipo de cambio (`NO_FX`) tampoco se llama (sin costo medible no hay presupuesto que cuidar). **Antes de cargar tarifas en Admin → IA y Consumo la IA queda en pausa.**
- **Agentes:** borrador sugerido → estado `budget_exhausted` (distinto de `off`); modo Automático → la conversación pasa a una persona con el motivo; pipeline → se omite; Probador → mensaje de pausa. No se cambia la configuración ni se borra nada; el bloqueo es temporal y se levanta solo con ciclo nuevo, ampliación, restablecimiento o recarga. CRM, POS y automatizaciones sin IA no se tocan. En Admin se distingue **"Desactivado manualmente"** de **"Bloqueado por presupuesto"** (`getAgentStatuses`).
- **Política al 100 %:** `BLOCK` por defecto. `DEGRADE` (modelo económico con tarifa y **tope de gasto extra**) solo con configuración explícita, a nombre del admin que la autoriza.
- **Acciones de admin auditadas** (con motivo): ampliar, restablecer (asiento compensatorio), ajuste ±, fijar presupuesto, política. Los ajustes son inmutables; un error se corrige con otro asiento.
- **Recargas:** `applyTopup(org, monto, referenciaDePago)` acredita una recarga **ya confirmada**, idempotente por referencia; al sumarse capacidad el tenant vuelve a usar IA solo. (La compra/pasarela de recargas llega con el cobro de suscripciones.)
- **Alertas 50/75/90/100 %** idempotentes (`AiBudgetAlert`, única por tenant+ciclo+umbral): admins de Reymen desde 75 %, dueños del negocio desde 90 % (sin costos internos), todo en la bitácora.
- **n8n y POS:** `POST /api/webhooks/n8n/ai` (firma de plataforma) llama a IA por el **mismo gateway**: mismo ledger, mismo presupuesto, mismo bloqueo (`{status:"blocked", handoff:true}` para que el flujo siga sin IA o pase a una persona). Valida organización, módulo de IA y automatización; las llaves nunca salen de Reymen.

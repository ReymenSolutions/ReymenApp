# 11 — Backlog listo para planificación

**I — trabajo propuesto, no iniciado.** Historias agrupadas por dependencias, cada una debe convertirse en cambio acotado con evidencia de tests y revisión. Estimaciones orientativas en días-persona, incluidas dentro de fases de07, no sumar dos veces. BD y deploy requieren fase/autorización correspondientes.

## P0 — Seguridad y continuidad

### AG-001 · Guardias uniformes de configuración

Como OWNER quiero que solo administradores autorizados cambien conocimiento/identidad, para no alterar respuestas por una cuenta de lectura.

- Evidencia: H01; [KB](../../src/actions/knowledge-base.ts), [assistant](../../src/actions/whatsapp-assistant.ts), [rulebook](../../src/actions/rulebook.ts), [conversations](../../src/actions/conversations.ts).
- Tareas: helper sesión+org+permiso+módulo; aplicar a todas las mutaciones; UI coherente; límites inputs y AuditLog sin texto sensible.
- Aceptación: OWNER/MANAGER según permiso permiten; AGENT/VIEWER/CLIENT deniegan gestión; anónimo/suspendido denegado; orgB no accesible; ningún write ni llamada externa ante rechazo. Edición omitida de tags no los borra.
- Pruebas QA01/02, regresión roles; dependencia ninguna, **2–3d**. Rollback no vuelve a habilitar permiso inseguro; revertir UI independientemente del guard.

### AG-002 · Fallos de IA con estado recuperable

Como operador quiero ver por qué no se respondió y poder continuar manualmente.

- Evidencia H02/H04; [auto](../../src/lib/ai-auto-reply.ts).
- Tareas: terminal FAILED/derivación con motivo; tiempos/humano coherentes; no retornar delivered/replied ante fallo de transporte; revalidar modo/control humano antes de envío.
- Aceptación: proveedor falla → trabajo terminal o retry durable, no GENERATING indefinido; humano/apagado durante LLM impide envío; mensaje fallido visible y recuperable sin duplicar.
- QA05/06/07/08; depende AG001 y contrato AG003 para durabilidad, **3–5d**. Rollback: pausar AUTO piloto y mantener inbox humano.

### AG-003 · Ejecución durable por evento

Como operador quiero recuperar el trabajo aceptado tras reinicio.

- Evidencia H05; [ruta conversación](../../src/app/api/webhooks/n8n/conversations/route.ts), [retry](../../src/lib/webhook-retry.ts).
- Tareas: modelo aditivo Execution/steps/outbound; key estable por evento/operación, claims/lease/deadline, runner PostgreSQL, reconciliación de aceptación ambigua y métricas.
- Aceptación: crash en cada frontera no pierde evento; retry de webhook no duplica mensaje/tool; 2 workers solo reclaman una vez; mensajes externos con timeout se concilian antes de repetir.
- QA03/06/08/22; depende inventario/modelo AG008, **4–6d**. Rollback: drenar/pausar claims nuevos y volver adapter conservando pendientes.

### AG-004 · Conversaciones por conexión, control humano continuo

Como cliente quiero que cada respuesta llegue al canal donde escribí.

- Evidencia H03; [procesador:138](../../src/lib/webhook-processors.ts#L138).
- Tareas: definir identidad compuesta por connection/thread; resolver ESCALATED y reopening; backfill ambiguos en cola manual; mantener leadId CRM.
- Aceptación: mismo teléfono/correo en canales/cuentas distintos no mezcla hilo; hilo escalado sigue humano; eventos simultáneos crean uno; IDs existentes preservados y ningún merge destructivo.
- QA02/04/05/21; depende AG008/AG009 y datos piloto, **3–5d**. Rollback adapter por tenant con mapping conservado.

### AG-005 · Contrato seguro de conectores

Como operador quiero saber que un evento pertenece a la cuenta autorizada y que la entrega es verificable.

- Evidencia H11, [wrapper](../../src/lib/org-webhook-route.ts), [AI proxy](../../src/app/api/webhooks/n8n/ai/route.ts), [send](../../src/actions/conversations.ts).
- Tareas: schema/tamaño, event ID estable, scopes servicio/conexión, inventario de secretos sin valores, callbacks monotónicos, adjuntos por ID/URL autorizada; contrato versionado y pruebas sandbox.
- Aceptación: firma/timestamp/cuenta inválida rechaza antes de efectos; plataforma secret no sale a cliente; READ no degrada por SENT tardío; origen widget y loop email se comprueban antes de habilitarlos.
- QA03/08/23/24, depende inventario n8n y AG009, **3–5d base**. Rollback compatible de payloads, sin pérdida de callbacks pendientes.

### AG-006 · Contabilidad honesta y reconciliación

Como administrador quiero distinguir gasto estimado, desconocido y conciliado sin reescribir historia.

- Evidencia H08; [gateway](../../src/lib/ai/gateway.ts), [budget](../../src/lib/ai/budget.ts), [portal usage](../../src/lib/ai/portal-usage.ts).
- Tareas: estado de incertidumbre, modelo/tarifa efectivos, cierre/reconciliación PENDING, snapshot de ciclo y presupuesto, control raíz/paso y costo de prueba.
- Aceptación: fallo proveedor no se etiqueta gratuito; fallo ledger conserva trabajo conciliable; fallback distinto no usa tarifa errónea sin advertencia; cambio plan no altera ciclo pasado; presupuesto tenant manda sobre subcuotas.
- QA10/11/17/18; depende AG008 para nuevos campos, **3–5d**. Rollback de lectura, nunca borrar ledger/ajustes.

### AG-007 · Efectos CRM y aprobaciones explícitas

Como OWNER quiero decidir qué puede cambiar la IA en mi CRM.

- Evidencia H06; [pipeline](../../src/lib/ai-pipeline.ts), [acciones](../../src/actions/ai-pipeline.ts).
- Tareas: separar modo de reply de política de CRM; schema/grants/precondiciones, transacción local efecto+acción, aprobación inmutable/expirable y audit; conservar historial.
- Aceptación: SUGGEST no promete ausencia de efectos si legacy los tiene; UI informa política; nuevas instancias no escriben sin grant; cierre requiere rol humano; undo no pisa cambios posteriores; legacy+Alex no duplican oportunidad.
- QA01/05/08/13/25; depende AG001/AG008, **3–5d**. Rollback quitar capability nueva, pendientes siguen visibles.

## P0/P1 — Estructura de producto y MVP

### AG-008 · Registro de agentes y adapter legacy

Como negocio quiero conservar mi asistente mientras se habilita el nuevo catálogo.

- Base C [schema](../../prisma/schema.prisma#L862), H14; ADR02/09.
- Tareas: AgentDefinition/Instance versionados, tenant constraints, flags, adapter, inventario config/Prompt legacy, dry-run de backfill idempotente, entitlement separado.
- Aceptación: tenant sin flag no cambia; nombre/prompts/modos/conversaciones/ledger preservados; mapping ambiguo pendiente de revisión; ninguna activación automática Mark; cap antiguo no se factura distinto.
- QA01/02/21/22, depende inventario y AG001, **4–6d**. Rollback legacy sin drop/restore de BD.

### AG-009 · Channels y routing por cuenta

Como administrador quiero conectar una cuenta y escoger quién atiende sin editar el número dentro de un agente.

- Base C [channels](../../src/lib/channels.ts), [n8n](../../src/lib/n8n.ts), ADR02/10.
- Tareas: conexión por tenant, credencial referenciada, health verificable, rutas default/intención y prioridad, compatibilidad payload.
- Aceptación: número pertenece a org; agente apagado no seleccionable; no ambigüedad de default; “no verificado” sin actividad; enquiry conserva formulario; cuenta anterior preservada durante piloto.
- QA03/04/24, AG008 + operador conector, **4–6d**. Rollback de routing por tenant, conciliar salidas.

### AG-010 · Conocimiento compartido autorizado

Como administrador quiero asignar el mismo artículo a varios agentes sin duplicarlo.

- Base C [rulebook](../../src/lib/rulebook.ts), [KB](../../src/actions/knowledge-base.ts); H07/ADR06.
- Tareas: grants/revisiones, publicar/desactivar, selección por consulta y prueba de calidad, explicación de fuentes/truncado, preservar tags.
- Aceptación: una fila fuente y múltiples grants; sin grant no recupera; fuente de B inaccesible a A; revisión fija reproducible; más de ocho artículos no se descartan silenciosamente; no carga de archivo ficticia.
- QA02/09/14, AG001/AG008, **4–6d**. Rollback lector legacy por tenant conservando revisión.

### AG-011 · Mark seguro con lectura y humano

Como negocio quiero respuestas útiles y derivación cuando falten datos.

- Base C [auto](../../src/lib/ai-auto-reply.ts), [draft](../../src/lib/ai-draft.ts); ADR03/04/05.
- Tareas: registry tools allowlist, permisos mínimos, config/policy fijados, control turno, contexto autorizado, salida validada y fallback humano.
- Aceptación: máximo4 pasos/2calls/2tools/1handoff, deadline; schema inválido nunca ejecuta; fuente ajena no aparece; respuesta final única; persona toma control; presupuesto agotado no rompe venta ni inbox.
- QA02/05/06/09/10/13/25, AG002–010 aplicables y arnés AG013, **5–8d**. Rollback pausa instancia y regreso legacy tras reconciliación.

### AG-012 · UX intuitiva y métricas consistentes

Como usuario sin conocimientos técnicos quiero distinguir agente, canal, conexión y modo.

- Base C componentes de01; H09/H10/H13 y diseño05.
- Tareas: Overview/My Agents/perfil/Channels, labels accesibles, estados, i18n, métricas con mismo filtro, grid solitario reutilizable y lista paginada KB/actividad.
- Aceptación: 12 activas muestra12, ratio≤100 por definición consistente; “no verificada” si no hay actividad; sin prompts técnicos obligatorios; n1–9 cards correctas, móvil sin overflow, dark sin flash, teclado y nombres accesibles.
- QA15/19/20, AG008 y APIs de estado, **5–8d**. Rollback navegación anterior por flag, mismos datos.

### AG-013 · Playground sin efectos reales

Como administrador quiero probar agente/canal/workflow sin enviar ni modificar clientes.

- Base C [AgentTester](../../src/components/portal/AgentTester.tsx), [agent actions](../../src/actions/agent.ts); ADR08.
- Tareas: modos single/channel/workflow, fixtures/versiones, mock/read-only tools, trace redacted, gasto opt-in real, reset cancela/ignora ejecución previa, corpus golden.
- Aceptación: runner rechaza write/send aunque UI los pida; presupuesto dedicado real, mock no se anuncia como validación de canal; caso reproducible; reset no revive respuesta anterior.
- QA09/13/15/16, arnés mínimo antes AG011 y UI tras Execution estable, **4–6d**. Rollback al probador anterior con copy correcto.

### AG-014 · Alex y handoff acotado

Como negocio quiero ayuda de ventas dentro de la misma conversación.

- Base C pipeline/LeadAgentActions; ADR03/04.
- Tareas: especializar herramientas existentes, routing por intención, transición única y resumen scope, control de conflictos, approval cierre.
- Aceptación: no bucle de retorno; sin grant no delega; continúa Conversation; una oportunidad/cambio, una respuesta final; costo total incluye ambas llamadas sin duplicar conversación.
- QA04/08/13/17, Mark piloto + AG007/AG013, **5–8d**. Rollback quitar Alex de routing, no borrar acciones.

### AG-015 · Uso y resultados por especialista

Como administrador quiero comparar utilidad/costo sin contar dos veces al cliente.

- Base C [report](../../src/lib/ai/report.ts), [portal usage](../../src/lib/ai/portal-usage.ts); ADR07.
- Tareas: attribution opcional histórica/nueva, filtros canal/instancia/modelo, definición de métricas, DTO comercial sin costo interno, export auditado.
- Aceptación: 3calls/2agentes/1conversation = tres llamadas y una conversación; suma costos consistente; retail separado; pasado sin atribución queda legacy/no asignado, no inventado Mark.
- QA17/18/19, AG006/AG008, **3–5d**. Rollback reportes previos, ledger intacto.

### AG-016 · Concurrencia comercial y solicitudes

Como negocio quiero que mi cuota y solicitudes se apliquen una sola vez.

- Base H12 [agent-cap](../../src/lib/agent-cap.ts), [ai-capacity](../../src/actions/ai-capacity.ts).
- Tareas: admisión serializada por org, request key/constraint para solicitud abierta, error legible y auditoría.
- Aceptación: última plaza admite solo una de dos activaciones; dos clics/requests crean una solicitud; no se realiza cobro y notificación es idempotente.
- QA12, AG001/AG008, **1–2d**. Rollback conserva constraint y datos, no restaura race.

## P2 — Expansión controlada

### AG-017 · Catálogo y especialistas adicionales

Como negocio quiero activar funciones concretas cuyo valor esté demostrado.

- Tareas: discovery Nora/Cora/Mia/Atlas, registrar capacidades reales/entitlements, reusar agenda/reportes/automations; no crear tickets/microservicios sin necesidad.
- Aceptación: Mia requiere aprobación para publicar; Cora valida disponibilidad concurrente; Atlas solo lee scopes autorizados; Nora deriva si no hay servicio de tickets; cada especialista supera corpus, tiene precio/permiso/rollback y no se activa solo.
- QA específico más01/02/08/09/13/17/25; depende piloto Mark/Alex y ADRs aprobadas; **3–5d catálogo +5–10d/especialista**. Rollback retirar oferta/pausar sin borrar historial.

## Definition of done para cada historia

Código/revisión solo en etapa autorizada; pruebas ejecutadas con resultados reales; migración ensayada si necesaria; evidencia de permisos/tenant/efectos/costo; copy ES/EN/a11y cuando hay UI; docs/contrato actualizados; feature flag y rollback; ninguna credencial ni PII real en fixtures/PR. Historia no se marca completa por aparecer un botón o una tabla.

Para iniciar: aprobar fase0B y preparación de fase1 con BD desechable, decidir piloto/entitlements/política de CRM, confirmar versión main/VPS. Producción necesita propuesta concreta separada; estos documentos no ejecutan esa aprobación.

## Estado tras Fase 0

- AG-001: guardias y pruebas de autorización implementadas; auditoría/versionado ampliados quedan fuera de la corrección mínima.
- AG-002: fallos, recuperación y control humano implementados con estado y alerta existente.
- AG-003: recuperación mínima implementada con WebhookEvent; no modelo Execution multiagente ni dependencia de AG-008.
- AG-004: canal/tenant/continuidad corregidos; connectionId y reconciliación de cuentas históricas pendientes.
- AG-005: validación compatible del mensaje, sin cambios de credenciales/conectores. El contrato completo de cuentas/scopes/media sigue pendiente.
- AG-006–017: no implementadas como historias completas; solo ajustes de compatibilidad expresamente descritos en12.

Ver [entrega Fase 0](12_IMPLEMENTACION_FASE_0.md). No continuar con AG-008 ni fases multiagente sin nueva autorización.

## Avance autorizado de Fase 1

AG-008 cuenta con modelo/adaptor/versiones/backfill/flags y pruebas. AG-003 añade raíces/pasos que observan los trabajos durables existentes, sin segundo worker. Gates de inventario/cutover real siguen pendientes. AG-009–017 no se dan por implementadas. Evidencia, límites y rollback en [13](13_IMPLEMENTACION_FASE_1.md).

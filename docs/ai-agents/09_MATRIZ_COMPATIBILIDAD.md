# 09 — Matriz de compatibilidad

Actual = **C** con evidencia; destino y estrategia = **I**. Datos y despliegue reales = **V** hasta inventario. Principio: preservar IDs, configuración y derechos, no eliminar funcionalidades o datos porque no aparezcan en la UI nueva.

| Función/dato actual y evidencia | Destino | Compatibilidad y validación |
|---|---|---|
| `/portal/whatsapp`, [página](../../src/app/(portal)/portal/whatsapp/page.tsx) | Overview/My Agents/Channels | URL anterior mantiene entrada útil o redirección autorizada con flags; no perder links guardados |
| Tabs filtradas por rol, [nav](../../src/lib/portal-nav-tabs.ts) | Seis secciones propuestas | Preservar visibilidad y guardia backend; mostrar solo capacidades implementadas |
| Nombre `WhatsAppAssistant.name`, [schema:862](../../prisma/schema.prisma#L862) | publicName de instancia compatible | Copiar solo tras revisión de tenant; no reemplazar por Mark ni traducción de fábrica |
| phoneNumber, mismo modelo | ChannelConnection del tenant | Mantener columna/lectura vieja durante transición; validar cuenta real, no deducir WABA del texto |
| greeting/personality/capabilities legacy, mismo modelo | Inventario/configuración archivada y posible mapping | Runtime actual no usa todos estos campos; no borrarlos; comparar con Rulebook para resolver conflicto manual |
| isActive y modos, [agent-mode](../../src/lib/agent-mode.ts) | Estado de instancia + modo de atención por canal | Preservar OFF/SUGGEST/AUTO y fallback sin fila; no activar automáticamente |
| Tope canales maxAiAgents/override, [agent-cap](../../src/lib/agent-cap.ts) | Entitlements comerciales separados | No reinterpretar como especialistas cobrados; grandfathering, snapshot contractual; aplicar nuevos cupos solo por decisión comercial |
| Rulebook cuatro textos, [rulebook](../../src/lib/rulebook.ts) | Reglas de negocio comunes + instrucciones específicas | Mismos textos y nombre, revisión fija; reglas de seguridad nunca override por texto tenant |
| CRUD artículos/categoría/tags/isActive, [KB actions](../../src/actions/knowledge-base.ts) | Conocimiento versionado y grants | Mismo ID/contenido, preservar tags omitidos; archivar/desactivar en lugar de borrado irreversible futuro según política |
| GET KB `q/category`, [API](../../src/app/api/v1/knowledge-base/route.ts) | Adapter externo y retrieval por instancia | No romper consumidores n8n; nueva versión con scopes/paginación; no dar grants amplios porque API vieja los tenga |
| Prompt/PromptVersion y laboratorio histórico, [schema:972](../../prisma/schema.prisma#L972) | Archivo compatible/evaluación de reutilización | No declarar pruebas A/B vigentes; conservar referencias y resultados; migración solo después de inventario |
| `/portal/prompts` redirect, [ruta](../../src/app/(portal)/portal/prompts/page.tsx) | Conocimiento/config avanzada | Mantener navegación y no resucitar UI histórica sin caso |
| Tester local, [AgentTester](../../src/components/portal/AgentTester.tsx) | Playground individual seguro | Conservar capacidad de probar respuesta; copy de costos claro; nueva sesión de prueba sin enviar ni escribir CRM |
| preview guards, [preview:173](../../src/lib/ai-auto-reply.ts#L173) | Motor compartido con adapters de simulación | Mantener cobertura de humano/links/pagos; ampliar equivalencia de policy, no usar simulación como prueba de delivery |
| SUGGEST y ReplyDraft, [ai-draft](../../src/lib/ai-draft.ts) | Borradores de instancia bajo revisión | READY/USED/DISMISSED/FAILED y finalContent preservados; una respuesta por mensaje; no enviar borrador al migrar |
| AUTO, [auto-reply](../../src/lib/ai-auto-reply.ts) | Mark/runtime durable | Conservar consentimiento de modo y límites hasta revisión; corregir fallos y races, no ampliar autonomía silenciosamente |
| Conversation/Message, [schema:509](../../prisma/schema.prisma#L509) | Hilo continuo con connectionId y executions | IDs/historial/delivery/attachments no se borran; no crear conversación nueva por handoff de especialista |
| Contact identity CRM, [procesador:230](../../src/lib/webhook-processors.ts#L230) | Contexto mínimo/grants tools | Mantener leadId y normalización; conexión por canal no duplica contacto ni fusiona automáticamente hilos |
| Manual reply/escalar/resolver, [actions](../../src/actions/conversations.ts) | Inbox humano y control de turno | Permisos corregidos; humano puede continuar sin IA, presupuesto o especialista; mantener asignación y auditoría |
| Estado n8n `aiHandled`, [API status](../../src/app/api/v1/conversations/status/route.ts) | Estado compatible + handoff explícito | Adaptador debe respetar pausa; mantener contrato viejo hasta actualizar emisor; control humano fuente autoritativa |
| Entrada conversación HMAC, [ruta](../../src/app/api/webhooks/n8n/conversations/route.ts) | Channel Gateway y event ID estable | Mantener secreto por org/versionado; cambiar contrato gradualmente; callback/evento pendiente sigue procesable |
| Seis canales genéricos, [channels](../../src/lib/channels.ts) | Conexiones separadas verificadas | Mismo alias/destino durante coexistencia; no marcar conectado por tener AUTO |
| Enquiry formulario, [channels](../../src/lib/channels.ts) | Intake + atención CRM | Preservar semántica consulta; no crear chat/ticket obligatorio; destino saliente autorizado |
| Outbound n8n, [n8n](../../src/lib/n8n.ts) | Conector + delivery outbox | Preservar messageId y webhook paths existentes; retries dedup, sin cambiar envío operativo del tenant de golpe |
| /n8n/ai gateway firmado, [ruta](../../src/app/api/webhooks/n8n/ai/route.ts) | Service identity con scope | Mantener sólo servidor confiable y rotación planificada; no dar secreto global a instancia/agente |
| PipelineAiRun/Action y undo/accept/reject, [pipeline](../../src/lib/ai-pipeline.ts) | Capacidades Alex compatibles | Un solo consumidor por capacidad; conservar historial/sugerencias y acciones humanas, no doble ejecución legacy+Alex |
| AiUsage/AiRate/FX, [gateway](../../src/lib/ai/gateway.ts) | Ledger compartido Core | Añadir attribution nullable; no inventar agente histórico ni reescribir costos para cuadrar; unknown/estimated/confirmed claros |
| Budget BLOCK/DEGRADE/reservas/ajustes, [budget](../../src/lib/ai/budget.ts) | Presupuesto global tenant más límites por ejecución | Conservar ajustes/créditos/topup/autor; no sumar cuotas independientes que excedan presupuesto tenant |
| My AI Usage y solicitudes, [portal usage](../../src/lib/ai/portal-usage.ts) | Usage & Analytics | Preservar porcentaje/renovación/capacidad; no exponer costos internos ni cobrar al solicitar |
| Admin AI filtros/CSV, [report](../../src/lib/ai/report.ts) | Analytics interno | Conservar filtros, escaping CSV y acceso admin; ampliar sin duplicar conversación |
| Roles/módulos, [permissions](../../src/lib/permissions.ts), [modules](../../src/lib/modules.ts) | Policy Core y grants | Nunca convertir un rol cliente en admin por activar agente; AI_WHATSAPP permanece compatible inicialmente |
| Automation/DomainEvent, [tick](../../src/lib/automation-tick.ts) | Automatizaciones deterministas y jobs compatibles | No romper CRM/loyalty ni ejecutar dos veces el mismo evento; dedup por consumidor/operación |
| POS ventas/clientes/loyalty, [POS orders](../../src/app/api/webhooks/pos/orders/route.ts) | Tools futuras acotadas, fuera MVP de writes | Cobro no depende del modelo/n8n; no cambiar visitas/recompensas/consentimiento por activar IA |
| Tokens visuales/ES-EN, [globals](../../src/app/globals.css) | Misma identidad + componentes responsivos | No reset de tema/idioma ni flash; permisos y copy coherentes |

## Criterios transversales de compatibilidad

1. Snapshot antes/después por tenant: cantidades, IDs, textos, grants, modos y sumas contables; cada diferencia documentada.
2. Hilo con mensajes recibidos antes/después de cutover continúa con mismo ID y delivery correcto. Handoff no duplica Conversation.
3. Un solo runtime aplica efectos. Shadow solo calcula, no envía ni modifica CRM; inferencia de evaluación real tiene costo explícito separado.
4. Roles no ganan permisos por copiar configuración. Arreglar H01 puede quitar acceso que accidentalmente existía: documentar como corrección de seguridad, no entitlement contractual.
5. Apagar nueva UI/agente preserva datos y operación manual. No restaurar backup antiguo para revertir una pantalla.
6. Legacy desconocido se marca “requiere revisión”, nunca se descarta o rellena con defaults de Mark silenciosamente.

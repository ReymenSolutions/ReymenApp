# 10 — Decisiones arquitectónicas propuestas

Todas **I / estado: propuestas**, pendientes de aprobación; no implementación. Bases verificadas C referenciadas. Fecha 2026-10-20.

## ADR-01 — Monolito modular primero

**Contexto C:** Next.js/PostgreSQL, gateway/ledger/RBAC ya existen ([package](../../package.json), [gateway](../../src/lib/ai/gateway.ts)). **Decisión:** separar módulos Core/Agents internamente, con contratos claros. **Alternativas:** microservicios por agente, nueva plataforma aparte. **Motivo:** no hay medición que justifique red/despliegues/broker adicionales. **Consecuencia:** disciplina de dependencias y límites; extraer runner solo si métricas de aislamiento/carga lo justifican.

## ADR-02 — Instancia distinta del canal

**Contexto C:** cap y AgentChannelSetting cuentan canales ([agent-cap](../../src/lib/agent-cap.ts)). **Decisión:** AgentDefinition/Instance + ChannelConnection/Routing; conexión pertenece a organización, no Mark. **Alternativas:** una instancia por canal o cambiar nombre WhatsAppAssistant a Agent. **Motivo:** un canal admite especialistas y un especialista varias conexiones; rename no resuelve separación. **Consecuencia:** contrato comercial nuevo y adapter legacy obligatorio.

## ADR-03 — Routing determinista y delegación acotada

**Contexto C:** actual respuesta+pipeline pueden hacer dos calls ([ruta conversación](../../src/app/api/webhooks/n8n/conversations/route.ts)). **Decisión:** un agente inicial, reglas de intención, handoff autorizado máximo1/profundidad1, límite4 pasos/2calls. **Alternativas:** supervisor LLM siempre, conversación abierta entre agentes. **Motivo:** costo/latencia/loops sin valor demostrado. **Consecuencia:** menor flexibilidad inicial; ampliar límites solo con evals.

## ADR-04 — Tools como servicios autorizados, no prompts

**Contexto C:** hay funciones de negocio y permisos, no registry ([permissions](../../src/lib/permissions.ts), [pipeline](../../src/lib/ai-pipeline.ts)). **Decisión:** registry en código con schemas/riesgos, grants por instancia y contexto servidor. **Alternativas:** herramientas genéricas SQL/HTTP/shell, pasar sesión OWNER. **Motivo:** ACL real, mínimo privilegio, auditabilidad. **Consecuencia:** cada capability requiere contrato/test, no habilitación automática por descripción comercial.

## ADR-05 — Ejecuciones durables y salida reconciliable

**Contexto C:** after no persiste tarea, H02/H05 ([auto](../../src/lib/ai-auto-reply.ts#L152)). **Decisión:** persistir raíz/step/lease/outbound con idempotencia; usar PostgreSQL/cron existentes. **Alternativas:** conservar solo after; introducir broker ahora. **Motivo:** resolver reinicios/duplicados sin operación extra injustificada. **Consecuencia:** monitor de cola, expiración y reconciliación; “exactly once” externo no se promete sin soporte del proveedor.

## ADR-06 — Conocimiento compartido con grants y revisiones

**Contexto C/P:** KB textual, 8×1200, sin ACL por agente ([rulebook](../../src/lib/rulebook.ts#L67)). **Decisión:** reusar KnowledgeBase y añadir asignación/versiones; medir retrieval textual primero. **Alternativas:** duplicar fuentes por agente, vectorDB inmediata. **Motivo:** menos divergencia y costo; embeddings no arreglan permisos. **Consecuencia:** calidad debe medirse y límites mostrarse; evaluación futura justifica búsqueda semántica si necesaria.

## ADR-07 — Conservar ledger único y separar precio

**Contexto C:** AiUsage/AiRate/budget maduros pero agentKey=canal, costos estimados ([schema:2306](../../prisma/schema.prisma#L2306)). **Decisión:** ampliar pointers nullable y snapshots, contar conversación distinct tenant+id; unknown/estimated/confirmed separados de precio comercial. **Alternativas:** ledger por agente, sumar subtotales de conversación, facturar automáticamente costo estimado. **Motivo:** conciliación y continuidad. **Consecuencia:** compatibilidad de reportes y política comercial explícita.

## ADR-08 — Playground con límites de entorno en backend

**Contexto C:** probador no envía pero consume proveedor/ledger ([preview](../../src/lib/ai-auto-reply.ts#L173)). **Decisión:** mismo motor de policy, adapters mock/read-only, pruebas versionadas; real model opt-in con presupuesto. **Alternativas:** ejecutar tools reales y poner aviso; motor de simulación independiente que diverge. **Motivo:** evitar efectos accidentales y resultados irrelevantes. **Consecuencia:** distinguir fidelidad del modelo de simulación de delivery, no presentar mock como prueba de producción.

## ADR-09 — Migración expand/adapter/piloto/contract

**Contexto C:** campos/tablas legacy y configuraciones únicas por tenant ([schema:862](../../prisma/schema.prisma#L862)). **Decisión:** aditivo, revisión por organización, flags, un único autor de efectos, rollback de aplicación sin borrar datos. **Alternativas:** migrar todos a Mark automáticamente; reemplazar tablas/canales. **Motivo:** preservar identidad, conversación, consumo y derechos. **Consecuencia:** costo temporal del adapter; retiro solo tras inventario/prueba/acuerdo.

## ADR-10 — Aprovechar n8n sin atribuirle garantías no verificadas

**Contexto C:** contratos genéricos y flujos JSON parciales ([n8n](../../src/lib/n8n.ts), [INBOX-CANALES](../crm/INBOX-CANALES.md)). **Decisión:** verificar conector piloto y formalizar cuenta/health/scopes/ventanas; conservar transporte. **Alternativas:** reconstruir seis conectores; asumir que toggle AUTO conecta Meta. **Motivo:** compatibilidad y evidencia. **Consecuencia:** permisos/token/delivery externos son gate de piloto, no detalle posterior.

## ADR-11 — Office fuera del dominio de permisos SaaS

**Contexto:** Office es objetivo futuro del usuario, no producto auditado ni implementación encontrada. **Decisión:** compartir interfaces/técnica Core solo con identidad/grants/almacenamiento separados; no acceso universal a clientes. **Alternativas:** reutilizar SUPER_ADMIN como identidad de agentes internos. **Motivo:** reducir exposición cruzada y alcance del proyecto. **Consecuencia:** herramientas de ingeniería/ejecución de código necesitan otro threat model y autorización.

## ADR-12 — UX por capacidades y estado verificable

**Contexto C:** UI llama agente a canal y salud deriva de ausencia de error ([page:24](../../src/app/(portal)/portal/whatsapp/page.tsx#L24)). **Decisión:** mostrar especialista, canal, modo y conexión por separado; Workflows después del MVP; reutilizar diseño actual. **Alternativas:** exponer prompts/modelos como configuración principal, marketplace vacío y muchos toggles. **Motivo:** comprensión sin conocimientos técnicos. **Consecuencia:** copy/estados tienen contrato backend y QA, no etiquetas comerciales arbitrarias.

## Decisiones pendientes del propietario / operación

| Decisión | Recomendación | Necesaria para |
|---|---|---|
| Tenant/canal piloto | Uno con conexión verificable y responsable humano; no asumir Villa Gardenia sin su revisión | Cutover |
| Oferta/cupos | Mantener derechos por canal actuales; separar límite de instancias en planes nuevos | Modelo comercial |
| Autonomía CRM | Sugerir inicialmente; escrituras auto solo política explícita | Alex y pipeline |
| Nombre público/instrucciones | Preservar por tenant, revisar conflicto legacy | Backfill |
| Política de retención/PII | Definir por tipo; no borrar compras/historial automáticamente | Traces/fixtures |
| Presupuesto y SLA | Tope prueba/piloto y objetivos tras baseline | Evals y producción |
| Conectores reales | Export saneado + pruebas sandbox del canal piloto | Channels |

Estas decisiones no bloquean terminar documentación. Tampoco constituyen solicitud de despliegue: etapa2 requiere aprobación explícita.

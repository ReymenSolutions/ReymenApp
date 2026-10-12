# Inbox unificado con IA y pipeline automático — diseño

Pedido del usuario (2026-10-12): un inbox con todos los canales; al abrir un chat la respuesta ya viene escrita pero editable, con botón "Usar respuesta" ("Use response" en inglés); un pipeline que trabaje solo (el CRM no debe ser trabajo extra); y un rulebook por negocio que la IA use. Decisiones: **Claude API desde la app** y **autonomía "aplica lo seguro y avisa, con deshacer"**. Los mensajes al cliente **nunca** salen sin que la persona presione Enviar.

## Lo que ya existe y se reutiliza
`Conversation` / `Message` (WhatsApp vía n8n), `KnowledgeBase` (artículos), `Prompt` (versiones), `sendManualMessage` (envío por n8n), `Lead`/`Opportunity`/`PipelineStage`, `DomainEvent` + motor de blueprints, bitácora de auditoría.

## Fases (un PR por fase)
1. **Rulebook** del negocio: secciones fijas (cómo habla, saludo, nunca, precios) + artículos de conocimiento; es lo que la IA lee.
2. **Inbox**: `/portal/inbox` con pestañas por canal (WhatsApp, Instagram, Messenger, chat del sitio, correo y consultas), punto rojo de pendientes, bandejas (Entrada / Enviados / Archivado), hilo y compositor. Entrada multicanal por un endpoint firmado (n8n u otros conectores) con identidad por canal (teléfono, usuario o correo).
3. **Borrador IA**: al llegar un mensaje se genera (Claude, con rulebook + conversación + datos del CRM) un `ReplyDraft`; al abrir el chat ya está escrito, se edita y se envía con "Usar respuesta" / "Use response". Descartable. Sin `ANTHROPIC_API_KEY` la función queda apagada y el inbox funciona igual.
4. **Pipeline con IA**: por cada mensaje entrante la IA clasifica la intención y aplica lo seguro (crear oportunidad, mover de etapa, resumir, siguiente actividad), deja una `AiAction` con el motivo y se puede **deshacer**; lo no seguro (perder un trato, cambios de monto grandes) queda como sugerencia.

## Conectores de canal (fuera de este repo)
Instagram, Messenger y correo requieren credenciales/aprobación de cada plataforma; la app expone la entrada y la salida genéricas por canal y los conectores viven en n8n (como WhatsApp hoy).

## Estado de la fase 3 (borrador de IA) — implementada
- **Dónde corre:** Claude desde la app (`@anthropic-ai/sdk`), modelo `claude-opus-5-5` por defecto (`AI_DRAFT_MODEL` lo cambia), esfuerzo bajo, instrucciones del negocio con caché y respaldo automático de la API ante rechazos de seguridad.
- **Cuándo se redacta:** al abrir una conversación cuyo último mensaje es del cliente (no antes: no se paga por borradores que nadie abre). Uno por mensaje del cliente (`ReplyDraft`, idempotente aunque se pida a la vez), con uso de tokens guardado.
- **Qué lee:** rulebook y artículos activos del negocio (`buildBusinessInstructions`), la conversación y datos reales del contacto (estado en el CRM y tratos abiertos). Nunca inventa precios: solo cita los del rulebook.
- **Cómo se usa:** la respuesta llega escrita en el cuadro (editable); "Usar respuesta" / "Use response" la vuelve a poner si se editó; "Otra versión" y "Descartar". Con un borrador activo, Enter agrega un renglón y se envía con Ctrl/Cmd + Enter. Al enviar se registra el texto final (para medir cuánto se edita). **Nada sale sin presionar Enviar.**
- **Encendido:** requiere `ANTHROPIC_API_KEY`, el módulo WhatsApp AI y el modo del canal distinto de **Apagado** (Agente IA → "Qué hace el Agente IA en cada canal"; por defecto **Sugerir**). Modos por canal: *Apagado* (no hace nada), *Sugerir* (borrador que una persona envía) y *Automático* (próximamente). El webhook `conversation.message` responde `aiMode` (`off|suggest|auto`) para que los flujos de n8n respeten el Apagado. Una sola fuente de conocimiento: Rulebook + artículos activos de la base de conocimiento (`buildBusinessInstructions`).

## Menú: un solo "CRM" con pestañas y módulo "Agente IA"
- El módulo `AI_WHATSAPP` se muestra como **Agente IA** / **AI Agent** (el código interno y la base de datos no cambian): cubre el asistente, el rulebook, los prompts, el laboratorio y los borradores en todos los canales, no solo WhatsApp.
- Con el módulo CRM, el menú tiene **una sola entrada "CRM"** (con el contador de clientes esperando respuesta) y las pantallas viven como pestañas: **Hoy, Inbox, Leads, Pipeline** y, con Reymen Foods, **Clientes del negocio** (`src/lib/crm-tabs.ts`, `CrmTabs`). Citas queda como entrada propia del menú, fuera del CRM. Las direcciones de siempre se conservan. Sin CRM, el menú mantiene las entradas sueltas que aplican (Citas, Clientes del negocio con Foods, Inbox con el Agente IA).

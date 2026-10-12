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

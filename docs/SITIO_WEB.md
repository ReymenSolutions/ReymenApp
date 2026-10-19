# Sitio público de Reymen (reymen.mx)

El sitio es estático (repositorio `Reymen-Web`) y habla con ReymenApp solo por tres endpoints públicos. Reymen funciona
como cliente de su propia plataforma: todo cae en una organización (slug `reymen-solutions`).

| Endpoint | Qué hace |
|---|---|
| `POST /api/public/leads` | Formulario → lead en el CRM (fuente `web`, consentimiento y versión del aviso guardados) + correo a dueños/admins/gerentes. |
| `POST /api/public/chat` | Chat → canal `webchat` del Inbox. Responde el Agente IA con el Rulebook y los guardarraíles; si duda, pide una persona o se agota la IA, la conversación pasa a *Escalada* y el visitante recibe `handoff: true`. |
| `GET /api/public/plans` | Precios del catálogo. **Apagado (404)** hasta `PUBLIC_PLANS_ENABLED=true`. |

Protección: origen permitido (CORS), límite por IP (leads 5/h, chat 20/10 min), 15 mensajes/h y 20 por sesión de chat, campo trampa
`website`, consentimiento obligatorio. No usan n8n.

## Configuración manual (una vez)

1. Admin → crear la organización **Reymen Solutions** (slug `reymen-solutions`) con módulos CRM y AI_WHATSAPP.
2. Admin → Consumo de IA: cargar tarifas y presupuesto (sin esto el agente se pausa y el chat pasa a persona).
3. Inbox → Agente IA: modo del canal **webchat** distinto de Apagado (Automático para que el chat responda solo). Escribir el Rulebook.
4. `.env`: `WEB_LEADS_ORG_SLUG`, `WEB_ALLOWED_ORIGINS` (si hay dominios extra) y, cuando quieras mostrar precios, `PUBLIC_PLANS_ENABLED=true`.

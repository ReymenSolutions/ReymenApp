# Despacho a n8n y callback

Contrato del PR 7 (ver ARQUITECTURA §C.3 y §O). Reymen nunca envía mensajes por sí mismo: arma la acción y la entrega a un **workflow genérico de n8n por tipo de acción**.

## Variables de entorno
| Variable | Dónde | Para qué |
|---|---|---|
| `N8N_BASE_URL` | Reymen | Base de n8n (p. ej. `http://n8n:5678`). Sin ella o sin secreto, el despachador no intenta nada y las ejecuciones quedan `PENDING`. |
| `N8N_WEBHOOK_SECRET` | Reymen **y** n8n | Firma de plataforma (en ambos sentidos) y llave del token por ejecución. |
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | n8n | Para que el workflow pueda verificar y firmar. |

## Reymen → n8n
`POST {N8N_BASE_URL}/webhook/reymen-action-message`

| Header | Valor |
|---|---|
| `X-Reymen-Timestamp` | ms desde epoch (n8n acepta ±5 min) |
| `X-Reymen-Signature` | `sha256=` + HMAC-SHA256 hex de `"<timestamp>.<cuerpo>"` con `N8N_WEBHOOK_SECRET` |
| `X-Reymen-Event-Id` | `<executionId>:<intento>` (idempotencia: n8n ignora un id ya procesado) |

El cuerpo trae organización, automatización, ejecución (`id`, `attempt`), disparador, destinatario (canal, teléfono, nombre), contenido (`templateKey`, `variables`), `callback` (`url` y `token`) y `deadline` (24 h). Timeout de 5 s.

## n8n → Reymen (callback)
`POST /api/webhooks/n8n/automation-executions` con los mismos headers de firma y el cuerpo:

```json
{ "executionId": "…", "token": "<callback.token>", "status": "sent | delivered | failed | skipped", "providerMessageId": "…", "error": "…" }
```
- `token` = HMAC-SHA256 del id de la ejecución (se verifica en tiempo constante): el workflow no necesita el secreto de cada organización.
- `sent`/`delivered` → `SUCCEEDED`; `failed` → `FAILED`; `skipped` → `SKIPPED` (`provider_skipped`).
- Idempotente: una ejecución ya terminada no cambia; un callback repetido responde `changed: false`.
- Respuestas: `200`, `400` cuerpo inválido, `401` firma/hora/token inválidos, `404` ejecución desconocida, `429`, `503` sin `N8N_WEBHOOK_SECRET`.

## Workflows
`n8n/workflows/reymen-action-message.json` (importar en n8n y activar). Envía por **WhatsApp con Twilio** usando **plantillas aprobadas** (`contentSid` por `templateKey` en el nodo «Verificar y preparar»; `variables` dice qué dato va en `{{1}}`, `{{2}}`…). Plantillas generales para todos los negocios y, opcionalmente, propias por negocio dentro de su renglón de `clientes` (tienen prioridad). Callback: `sent` si Twilio aceptó (con su `sid`), `failed` con el error de Twilio, `skipped` si el canal no es WhatsApp, el cliente no tiene número o la plantilla no está configurada (nunca manda texto suelto). La credencial «Twilio» vive en n8n.

## Avisos internos (alertas y reportes) — `reymen-action-notify`
Mismo despachador, otro workflow genérico: `POST {N8N_BASE_URL}/webhook/reymen-action-notify` (tipo `action.notify.send`), con las **mismas firmas, headers, idempotencia (`<executionId>:<intento>`) y callback** que el de mensajes. Sirve a **todos** los clientes: no lleva nombres, teléfonos, plantillas ni horarios dentro.

Diferencias del cuerpo (en lugar de `recipient` y `content.templateKey`):
```json
{
  "recipients": [ { "channel": "email", "email": "dueña@negocio.mx", "name": "Dueña" }, { "channel": "whatsapp", "phone": "+5215512345678", "name": null } ],
  "content": { "kind": "alert | report", "title": "…", "subject": "…", "text": "…", "html": "…" }
}
```
- **Reymen decide A QUIÉN** (dueños y gerentes activos para correo, y el WhatsApp del responsable configurado) **y QUÉ dice** (asunto, texto y HTML ya armados). n8n solo entrega por el canal de cada destinatario; no consulta nada ni decide nada.
- **Callback:** `sent` si todos salieron; `failed` (con `error`) si alguno falló; `skipped` si no hay destinatarios. **n8n no reintenta**: los reintentos los controla Reymen (con espera creciente, y el reintento manual del Admin solo si no hay id de proveedor), para no duplicar avisos.
- **Modo por automatización** (Admin → Configurar → "Avisar además por"): `Solo la campana` (sin n8n), `Correo`, `WhatsApp` o `Correo y WhatsApp`. La campana del portal siempre avisa. Se aplica a: `inventory_low_alert`, `daily_executive_report` y las calificaciones bajas de `post_visit_feedback`.
- Workflow: `n8n/workflows/reymen-action-notify.json` (importar y activar). **Proveedores ficticios**: reemplaza los bloques CORREO y WHATSAPP; las credenciales viven en n8n.
- La app **ya no manda correos por su cuenta** para estos avisos (se retiró el envío directo): una sola ruta de entrega.

## Configuración de cada cliente en workflows genéricos
Un workflow genérico **no lleva datos de ningún cliente dentro** (horarios, plantillas, teléfonos, enlaces): sirve a todos. La configuración vive en Reymen (`Automation.config`, editable en Admin → Cliente → Configurar) y llega a n8n por dos vías con el **mismo contenido**:

```json
{
  "organizationId": "…", "automationId": "…", "status": "ACTIVE",
  "template": { "id": "…", "version": "1.0.0" },
  "configuration": { "openHour": 9, "channel": "sms", "contact": "+5215512345678" },
  "missingRequired": []
}
```
- `configuration` = valores de fábrica + lo guardado para ese cliente. `missingRequired` = parámetros obligatorios sin valor (el workflow debe tratar la automatización como incompleta). Nunca incluye secretos.
- **Por evento:** cuando Reymen le avisa a n8n de algo para una automatización, el cuerpo firmado (mismas firmas de Reymen → n8n) trae `organizationId`, `event`, `data` y `automation` (el contenido de arriba).
- **Por consulta** (flujos que empiezan en un canal, p. ej. un WhatsApp entrante): `POST /api/webhooks/n8n/automation-config`, con la misma firma de plataforma (`X-Reymen-Timestamp`, `X-Reymen-Signature` = `sha256=` + HMAC-SHA256 hex de `"<timestamp>.<cuerpo>"` con `N8N_WEBHOOK_SECRET`) y el cuerpo `{ "organizationId": "…", "automationId": "…" }` o `{ "organizationId": "…", "templateId": "…" }`.
  - **Siempre se valida la organización**: si la automatización no existe, es de otro cliente o está pausada, responde `404` igual (no revela qué ids existen). Otros códigos: `400` cuerpo inválido, `401` firma/hora inválidas, `429`, `503` sin `N8N_WEBHOOK_SECRET`.

## Seguimiento de clientes por WhatsApp — `reymen-followups-whatsapp`
Workflow **genérico para varios negocios**: `n8n/workflows/reymen-followups-whatsapp.json` (importar, editar el nodo **Preparar mensajes**, probar y activar). Un negocio nuevo = un renglón más en `clientes`.

1. **Reglas en Reymen**: cada negocio las define en CRM → Contactos → **Configurar seguimientos** (estado del contacto, espera, intentos, texto con `{{contactName}}`). Reymen decide a quién toca: estado, tiempo, intentos máximos y «no contactar».
2. **Cada 30 min**, por cada negocio dentro de su horario, n8n consulta `GET /api/v1/leads/due-followups?orgId=…` con `X-Api-Key` = su llave de conexión. Cada fila trae `ruleName` y `triggerStatus` además de los datos del contacto. Si un negocio falla (llave mala, Reymen caído) se anota y los demás siguen.
3. Arma un WhatsApp por persona (solo canal `whatsapp`, teléfono a `+52…`, máximo por corrida y negocio) y lo envía con **Twilio** desde el número de ese negocio (credencial «Twilio» de n8n).
4. **Plantillas** (WhatsApp exige plantilla aprobada fuera de la ventana de 24 h). Se usa la primera con `contentSid`: (1) la del negocio para esa regla, por su nombre en Reymen; (2) la `default` del negocio; (3) la general para esa regla; (4) la `default` general. Sin ninguna se manda el texto de la regla, que solo entrega dentro de las 24 h. `variables`: `contactName` (primer nombre), `fullName`, `businessName`, `ruleName`, `attemptNumber`.
5. Por cada mensaje que Twilio aceptó, avisa `POST /api/webhooks/n8n/followup-sent` `{ leadId, ruleId }` firmado con la llave de **ese** negocio y `x-reymen-event-id` = `followup:<lead>:<regla>:<intento>`. Los fallidos no se avisan: Reymen los ofrece de nuevo en la siguiente corrida.
- **`modoPrueba`** general o por negocio (p. ej. uno nuevo en prueba mientras los demás envían): solo arma y muestra los mensajes, sin enviar ni avisar.
- `horaInicio`, `horaFin`, `zonaHoraria` y `maxPorCorrida` generales, y se pueden poner por negocio.

## n8n 2.x
Los flujos se probaron importándolos y ejecutándolos en **n8n 2.46**:
- El código de los nodos corre aislado: no hay `URLSearchParams` (los flujos arman el formulario de Twilio a mano).
- **`$env` está bloqueado por defecto** (`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`). Los flujos que verifican a Reymen con el secreto de plataforma (`reymen-inbox-*`, `reymen-action-message`, `reymen-action-notify`) lo toman de `secretoReymen` en su Configuración y, si está vacío, intentan `$env.N8N_WEBHOOK_SECRET`. Con n8n 2.x: llenar `secretoReymen` o poner `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
- `src/lib/n8n-workflows.test.ts` impide volver a usar cualquiera de los dos.

## Bandeja de WhatsApp, Instagram y Messenger + Meta Lead Ads
Guía paso a paso: `docs/crm/BANDEJA-N8N.md`. Dos workflows genéricos (sirven a varios clientes; cada cliente es un renglón en su nodo «Configuración»):

| Workflow | Webhooks | Qué hace |
|---|---|---|
| `reymen-inbox-whatsapp-twilio.json` | `POST reymen-twilio-entrante` (Twilio) · `POST whatsapp-outbound` (Reymen) · `POST reymen-twilio-estado` (Twilio) | Entrante → `/api/webhooks/n8n/conversations` (`channel: whatsapp`, `x-reymen-event-id: twilio:<MessageSid>`). Saliente: verifica la firma de plataforma y envía con la credencial «Twilio», con `StatusCallback` al webhook de estado. Estado → `/api/webhooks/n8n/message-status` (enviado, entregado, leído, fallido). Verifica `X-Twilio-Signature` si se pone el Auth Token. |
| `reymen-inbox-meta.json` | `GET`/`POST reymen-meta` (Meta) · `POST instagram-outbound` · `POST messenger-outbound` (Reymen) | Verificación del webhook (`hub.challenge`). Mensajes de Messenger/Instagram → `/conversations` (`contactHandle` = PSID/IGSID, nombre desde la Graph API, sin ecos). Lead Ads (`leadgen`) → pide el lead a la Graph API → `/api/webhooks/n8n/leads` (`externalId: meta-lead:<id>`, respuestas del formulario en `metadata`). Saliente: `POST /me/messages` con el token de la página. Verifica `X-Hub-Signature-256` si se pone el App Secret. |

Reymen ya tenía los dos extremos (entrada firmada con la llave del cliente y salida a `<canal>-outbound` firmada con `N8N_WEBHOOK_SECRET`); estos workflows son el puente con cada proveedor.

## Cuota mensual de ejecuciones (2026-11)

Para flujos externos, integrar `POST /api/v1/automations/runs` con JSON:

```json
{"automationId":"ID_DE_LA_AUTOMATIZACION","executionId":"ID_DURABLE_DEL_TRABAJO","action":"reserve"}
```

Usar la autenticación de webhook existente (`x-reymen-signature` con timestamp). `x-reymen-secret` solo se acepta en desarrollo; staging compilado exige HMAC. Guardar el secreto en credenciales de n8n, nunca en el JSON exportado.
Solo ejecutar efectos si HTTP 200 y `allowed: true`. HTTP 409 bloquea el trabajo; ante fallo de red no asumir permiso. Al terminar, enviar el mismo cuerpo con `action: "succeeded"` o `"failed"` si hay fallo definitivo. Un timeout de un tercero es incierto: no enviar `failed` hasta conciliarlo. Reutilizar executionId en reintentos y deduplicar los efectos en n8n. No enviar simulaciones a esta API.

Las reservas pendientes ocupan capacidad, pero solo SUCCEEDED cuenta como consumo exitoso. Mes UTC de admisión. Sin excedentes automáticos. Los flujos previos que no llamen a esta API **todavía no tienen control de cuota**. Ver el [plan de validación](../production/SERVICIOS_COMERCIALES_IMPLEMENTACION_2026-11-05.md).

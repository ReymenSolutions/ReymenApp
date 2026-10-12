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
`n8n/workflows/reymen-action-message.json` (importar en n8n y activar). **El proveedor es ficticio**: el nodo "Verificar, enviar (ficticio) y firmar" marca todo como enviado sin mandar nada. Cuando exista el número de WhatsApp y el aviso de privacidad, se cambia solo el bloque `PROVEEDOR` (las credenciales viven en n8n, nunca en Reymen).

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

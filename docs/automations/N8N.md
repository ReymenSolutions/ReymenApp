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

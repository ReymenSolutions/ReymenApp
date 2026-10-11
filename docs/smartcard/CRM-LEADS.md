# SmartCard → CRM: contactos capturados en la tarjeta

Cuando alguien deja sus datos en una SmartCard (formulario "déjanos tus datos"), el servidor de SmartCard
avisa a Reymen y se crea un **lead** en el CRM del negocio dueño de la tarjeta. Este documento es el contrato
para el repo `reymen-smartcard` (el lado emisor); el receptor ya existe en ReymenApp.

## Endpoint

`POST https://app.reymen.mx/api/webhooks/smartcard/leads`

| Header | Valor |
|---|---|
| `x-smartcard-timestamp` | milisegundos desde epoch (se acepta ±5 min) |
| `x-smartcard-signature` | `sha256=` + HMAC-SHA256 hex de `"<timestamp>.<cuerpo exacto>"` con `SMARTCARD_WEBHOOK_SECRET` |
| `x-smartcard-event-id` | opcional, id único del envío (idempotencia: reenviar el mismo no duplica) |

Cuerpo JSON:

```json
{
  "companyId": "<companies.id de SmartCard>",
  "name": "Nombre del visitante",
  "phone": "+52 55 1234 5678",
  "email": "visitante@correo.com",
  "message": "Quiero cotizar…",
  "cardId": "<id de la tarjeta>",
  "memberName": "Ana (dueña de la tarjeta)"
}
```

Hace falta `companyId`, `name` y `phone` **o** `email`.

## Cómo se resuelve el negocio
Por `companies.external_org_id` (el vínculo que ya usa el portal). Una company sin vincular responde `404`.

## Respuestas
`200` creado o ya existía (`duplicate: true` si el mismo `event-id`) · `400` cuerpo inválido · `401` firma/hora inválida ·
`403` el negocio no tiene el módulo CRM · `404` company desconocida · `429` demasiados envíos · `503` el receptor no tiene
`SMARTCARD_WEBHOOK_SECRET`.

## Qué pasa en Reymen
- Pasa por el mismo procesamiento que los leads de n8n: **no duplica** por teléfono, respeta el límite de leads del plan y
  los reintenta si falla.
- El lead queda con `source = smartcard` y el mensaje, la tarjeta y la persona en sus metadatos.
- Si el teléfono coincide con un **cliente del POS**, se enlazan solos.

## Configuración
En ReymenApp: `SMARTCARD_WEBHOOK_SECRET` (secreto compartido de plataforma, mínimo 32 caracteres aleatorios). En
`reymen-smartcard`: el mismo valor y la URL del endpoint. **El envío desde SmartCard aún no está implementado** (otro repo).

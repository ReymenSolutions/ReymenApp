# Inbox unificado: contrato para los conectores de canal

El inbox (`/portal/inbox`) muestra en un solo lugar las conversaciones de WhatsApp, Instagram, Messenger, chat del sitio, correo y consultas (formularios). Cada canal se conecta desde n8n (o cualquier servicio que firme el webhook); la app solo define la entrada y la salida.

## Entrada (mensaje del cliente o respuesta de la IA)
`POST /api/webhooks/n8n/conversations` — mismo firmado por organización que el resto de los webhooks de n8n (`x-reymen-orgid`, `x-reymen-timestamp`, `x-reymen-signature`, `x-reymen-event-id`).

```json
{
  "channel": "instagram",
  "contactHandle": "@casey_l",
  "contactName": "Casey Lindqvist",
  "message": { "role": "USER", "content": "¿Cuánto cuesta el cajón doble?", "externalId": "mid.123" }
}
```
- `channel`: `whatsapp`, `instagram`, `messenger`, `webchat`, `email` o `enquiry` (se aceptan alias como `ig`, `facebook`, `website_chat`, `contact_form`, `correo`). Un canal desconocido se conserva y solo aparece en "Todos".
- Identidad del contacto (al menos una): `contactPhone` (WhatsApp/SMS), `contactHandle` (id o @usuario de Instagram, Messenger o el visitante del chat web) o `contactEmail` (correo y formularios). También `conversationId` si el conector ya lo conoce.
- `subject` (opcional): asunto del correo o de la consulta.
- `message.role`: `USER` (cliente), `ASSISTANT` (IA) o `SYSTEM`. `externalId` evita duplicados si el conector reintenta.
- La conversación abierta del mismo contacto se reutiliza (por teléfono, por canal + usuario o por correo). Si escribe alguien nuevo, se crea su contacto en el CRM (respetando el módulo CRM y el límite del plan); un correo igual al de un contacto existente lo enlaza a él.
- Un mensaje del cliente suma un "sin leer", marca la conversación como pendiente de respuesta y la saca de "Archivadas".

## Salida (respuesta de una persona desde el inbox)
La app llama a `POST {N8N_BASE_URL}/webhook/<canal>-outbound` (WhatsApp conserva `whatsapp-outbound`; Instagram `instagram-outbound`, correo `email-outbound`, etc.), firmado como el resto de las llamadas a n8n, con:

```json
{ "organizationId": "…", "event": "message.send",
  "data": { "conversationId": "…", "messageId": "…", "contactPhone": null, "contactHandle": "@casey_l", "contactEmail": null,
            "subject": null, "channel": "instagram", "content": "Hola Casey…", "attachmentUrl": null, "attachmentType": null } }
```
El conector envía por su plataforma y reporta el resultado con el webhook `message.status` ya existente. Sin el flujo de ese canal, el mensaje queda guardado y marcado como no enviado.

## Credenciales y aprobaciones
Instagram, Messenger y correo requieren credenciales (y, en Meta, revisión de la app) de cada negocio: viven en n8n, nunca en la app.

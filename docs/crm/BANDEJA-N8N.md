# Conectar WhatsApp, Instagram, Messenger y Meta Lead Ads a la bandeja de Reymen

Todo pasa por n8n: Reymen no guarda tokens de Twilio ni de Meta. Cada mensaje que escribe un cliente aparece en **CRM → Inbox** (y crea o actualiza su contacto); lo que respondes en Reymen —o el Agente IA en modo automático— sale por el mismo canal. Los Lead Ads llegan como contactos nuevos con origen «Meta Lead Ads».

## Antes de empezar (una sola vez)
1. En el servidor de Reymen: `N8N_BASE_URL` (la dirección de n8n que ve Reymen) y `N8N_WEBHOOK_SECRET` (el mismo valor también en n8n).
2. En n8n: `NODE_FUNCTION_ALLOW_BUILTIN=crypto` y `N8N_WEBHOOK_SECRET` (ya los tienes si funcionan los seguimientos).
   - **n8n 2.x** no deja que los flujos lean variables de entorno. En cada flujo, pon el mismo valor de `N8N_WEBHOOK_SECRET` en `secretoReymen` (nodo Configuración / Verificar y preparar), o agrega `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` al entorno de n8n.
3. Por cliente: en Reymen, **Admin → Clientes → (cliente) → botón de webhook**: copia el **ID de organización** y la **llave de conexión**. La llave es secreta.

## 1. WhatsApp con Twilio — `n8n/workflows/reymen-inbox-whatsapp-twilio.json`
1. En n8n: **Import from file** y elige el archivo.
2. Credencial «Twilio» (Account SID + Auth Token) en el nodo **Twilio: enviar WhatsApp**.
3. Nodo **Configuración**: `reymenUrl`, `n8nUrl` (dirección pública de n8n), `twilioAccountSid`, `twilioAuthToken` (para validar que los avisos son de Twilio) y un renglón por cliente en `clientes` (`whatsapp`, `orgId`, `llave`).
4. Activa el flujo.
5. En Twilio, en el número (o Sender) de WhatsApp → **A message comes in**: `POST https://TU-N8N/webhook/reymen-twilio-entrante`.
6. Prueba: escribe al número desde tu celular → debe aparecer en **Inbox → WhatsApp**. Responde desde Reymen → te llega en WhatsApp y, al leerlo, el mensaje se marca como leído.

> WhatsApp deja responder texto libre solo dentro de las **24 h** desde el último mensaje del cliente. Para escribirle primero (automatizaciones, seguimientos) se necesita **plantilla aprobada**.

## 2. Instagram y Messenger con Meta — `n8n/workflows/reymen-inbox-meta.json`
1. Importa el archivo en n8n.
2. Nodo **Configuración**: `verifyToken` (una palabra que inventas), `appSecret` (App de Meta → Configuración → Básica) y por cliente `pageId`, `instagramId` (si tiene Instagram conectado a la página), `pageToken` (token de la página con `pages_messaging`, `instagram_manage_messages`, `leads_retrieval`, `pages_manage_metadata`), `orgId` y `llave`.
3. Activa el flujo.
4. En la App de Meta → **Webhooks**:
   - Producto **Page**: URL `https://TU-N8N/webhook/reymen-meta`, Verify token = tu `verifyToken`; suscribe `messages` y `leadgen`.
   - Producto **Instagram**: misma URL y token; suscribe `messages`.
   - Suscribe la página a la app (Graph API: `POST /{page-id}/subscribed_apps?subscribed_fields=messages,leadgen`).
5. Prueba: escribe a la página y al Instagram del negocio → aparecen en **Inbox → Messenger / Instagram** con el nombre del cliente.

## 3. Meta Lead Ads
Mismo flujo de Meta (paso 2): con `leadgen` suscrito, cada formulario enviado crea el contacto en Reymen (nombre, correo, teléfono; las demás respuestas, la campaña y el anuncio quedan en sus datos). Si la persona ya existía (mismo teléfono o correo) se completa su ficha en lugar de duplicarla. Prueba con la **Lead Ads Testing Tool** de Meta.

## 4. Mensajes de automatizaciones — `n8n/workflows/reymen-action-message.json`
Reemplaza al flujo anterior (que solo simulaba). En **Verificar y preparar**: `twilioAccountSid`, por cliente su número (`clientes`) y el `contentSid` de cada plantilla aprobada. Lo que no tenga plantilla se registra como «omitido» en Reymen, sin enviar.

**Plantillas generales y propias de un negocio**
- `plantillas` (abajo) son las **generales**: las usan todos los negocios. Con `businessName` en una variable, un mismo texto sirve para todos («Hola {{1}}, gracias por visitar {{2}}»).
- Si un negocio quiere sus propios textos, se agrega `plantillas` **dentro de su renglón**, solo con las que cambian. Para ese negocio se usa la suya; las demás siguen siendo las generales:
  ```js
  clientes: {
    'ID_LONIER': { whatsapp: '+5281…1' },
    'ID_VILLA':  { whatsapp: '+5281…2', plantillas: {
      birthday_campaign_v1: { contentSid: 'HX…', variables: ['name'] },
    } },
  },
  ```
- `variables` dice qué dato va en `{{1}}`, `{{2}}`…: `name` (cliente), `businessName`, `daysSince` (días sin venir), `rewardName` (recompensa), `feedbackUrl` (enlace para opinar).
- Si cada número de WhatsApp está en una cuenta de WhatsApp Business distinta, cada negocio necesita sus plantillas aprobadas en su propia cuenta aunque el texto sea igual: en ese caso, pon las de cada uno en su renglón.

## 5. Seguimientos de clientes — `n8n/workflows/reymen-followups-whatsapp.json`
Un solo flujo para todos los negocios: un renglón por negocio en `clientes` del nodo **Preparar mensajes** (su `orgId`, `llave`, número de WhatsApp y, si quiere, su horario, `modoPrueba` y plantillas propias). Las reglas se definen en Reymen (CRM → Contactos → Configurar seguimientos). Plantillas: la del negocio para esa regla → la `default` del negocio → la general para esa regla → la `default` general. Detalle en `docs/automations/N8N.md`.

## Si algo no llega
- **Mensaje entrante no aparece**: en n8n → Executions, revisa el error. «no está en Configuración» = falta el número/página de ese cliente. `401` de Reymen = `orgId` o `llave` mal copiados.
- **«Falta el secreto de Reymen» o «access to env vars denied»**: n8n 2.x; llena `secretoReymen` (ver «Antes de empezar»).
- **La respuesta sale «no enviado»**: el flujo de salida falló (Executions). Fuera de 24 h WhatsApp la rechaza (error 63016).
- **Meta no valida el webhook**: el `verifyToken` no coincide o el flujo no está activo.

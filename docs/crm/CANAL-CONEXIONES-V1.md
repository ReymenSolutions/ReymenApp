# Cuentas de canal — contrato v1, Fase 3

Implementación local tras flag `AI_CHANNEL_CONNECTIONS_ENABLED=false`. No acredita que exista un workflow desplegado, permisos del proveedor o una cuenta productiva verificada. Conserva el contrato anterior de [INBOX-CANALES](INBOX-CANALES.md); ningún conector existente se reemplaza automáticamente.

## Frontera y responsabilidades

El conector confiable continúa siendo n8n. App no recibe tokens del proveedor, descarga adjuntos ni implementa OAuth en esta fase. La referencia `credentialRef=organization` indica el almacén/configuración existente del conector; **no es una contraseña ni autoriza escoger una credencial ajena**. El conector debe resolver la combinación organización/canal/cuenta contra su configuración privada y comprobar con el proveedor qué cuenta y permisos posee.

Registrar cuenta en App solo crea metadata en pausa. Configurarla exige el permiso/módulo de gestión IA; recibir mensajes y responder manualmente conserva el acceso del Inbox con CRM o AI_WHATSAPP. Suspender solamente IA no concede otra autonomía ni bloquea la atención manual del CRM. Antes del piloto se necesita implementar/revisar en sandbox el workflow de este contrato, verificar identidad del proveedor, scopes, expiración, ventanas de respuesta, firma/eco de eventos, idempotencia y responsable humano. No reportar HEALTHY porque el workflow arrancó o porque alguien escribió un teléfono. La UI muestra disponibilidad **según el conector**, no una certificación independiente de Meta.

## Entrada

`POST /api/webhooks/n8n/channels`, JSON máximo 64 KiB. Headers:

- `x-reymen-orgid`: organización ligada al secreto del conector.
- `x-reymen-timestamp`: milisegundos Unix; ventana de cinco minutos y tolerancia futura de 30 segundos.
- `x-reymen-signature`: `sha256=<HMAC SHA-256(secret de ESA organización, timestamp + '.' + cuerpo exacto)>`.

HMAC obligatorio en todos los entornos; no se acepta el header de secreto en texto. El identificador de evento está **dentro del cuerpo firmado**. No incluir organizationId, secretos, tokens ni URLs libres en el cuerpo: el esquema estricto los rechaza. Nunca distribuir el secreto de organización al navegador o POS físico.

Campos comunes:

```json
{
  "version": 1,
  "connectionId": "id-local-de-la-conexion",
  "externalAccountKey": "identificador-real-de-la-cuenta",
  "generation": 1,
  "eventId": "id-estable-del-evento",
  "type": "health"
}
```

La cuenta debe corresponder al ID local y tenant autenticado. La generación cambia al pausar una cuenta habilitada. El conector debe usar la generación revisada por el operador, no adivinarla ni actualizarla por leer un error. Un evento de otra generación no reactiva una conexión.

### Verificación y salud

Añadir a los campos comunes:

```json
{
  "type": "health",
  "sequence": 1,
  "observedAt": "2026-10-21T12:00:00.000Z",
  "state": "HEALTHY",
  "providerVerified": true,
  "canReceive": true,
  "canSend": true,
  "outboundContractVersion": 1
}
```

Estados: HEALTHY, DEGRADED, DISCONNECTED. `sequence` entero creciente por generación, hasta 2147483647. `observedAt` debe ser reciente; no renovar un reporte antiguo cambiando únicamente la fecha del HMAC. Se ignoran secuencias/observaciones anteriores. Una misma cuenta confirmada (`channel + externalAccountKey`) no puede pertenecer a dos organizaciones; las inscripciones sin verificar no reservan IDs ajenos.

La disponibilidad vence a los cinco minutos sin verificación. Para mantenerse disponible, el conector necesita renovar evidencia con frecuencia inferior a ese plazo, incluso en ausencia de mensajes; configurar el intervalo de sondeo según límites del proveedor. App no instala ese sondeo en n8n. Una cuenta ya pausada permite reiniciar su verificación (nueva generación/secuencia) si el conector reinició su secuenciador; esto no renueva credenciales ni conecta por sí solo. HEALTHY sin ambos permisos se considera degradado; verificar cuenta no la habilita: eso requiere la acción autenticada del gestor. Pausar invalida evidencia y generaciones previas; volver a habilitar exige otra verificación.

### Mensaje entrante

Añadir a los campos comunes:

```json
{
  "type": "message",
  "eventId": "id-estable-del-mensaje-en-el-proveedor",
  "externalThreadId": "hilo-externo-estable",
  "contactPhone": "telefono-del-remitente",
  "contactName": "Nombre del cliente",
  "message": {
    "externalId": "id-estable-del-mensaje-en-el-proveedor",
    "content": "Hola, ¿cuál es el horario?"
  }
}
```

`eventId` debe ser exactamente `message.externalId`; no usar el ID de ejecución de n8n para cada reintento. Dedup por cuenta, tipo e ID estable, además de la llave de mensaje del hilo. Se admiten contactHandle/contactEmail y subject en lugar de teléfono según el canal; al menos una identidad es necesaria. El contenido tiene máximo 16000 caracteres. Este contrato solo admite mensajes entrantes de cliente, en texto. El conector debe filtrar ecos propios, autoresponders y mensajes de sistema del proveedor; no convertir todo webhook externo en USER.

Identidad del hilo = organización + cuenta + externalThreadId; el remitente no puede cambiar silenciosamente dentro de ese hilo. Dos cuentas con el mismo teléfono/contacto tienen conversaciones independientes. El CRM conserva identidad compartida por teléfono/correo; los handles sin esos datos se distinguen por cuenta. Un hilo cerrado vuelve a OPEN ante un nuevo mensaje del cliente, preservando su ID, asignación y control humano. No se reactiva IA por reabrirlo si ya estaba en control humano.

El mensaje y trabajos se admiten en una transacción. Se reutilizan los runners existentes, after() como acelerador y cron como recuperación; no hay segundo worker ni sender. El conector no debe generar respuestas de IA por su cuenta ni mantener otra rama automática del flujo anterior para estos mensajes. Sin ruta de asistente se admite atención manual, sin encolar AUTO/pipeline por esa cuenta. OFF/SUGGEST/AUTO y cupos existentes siguen aplicando por canal.

### Acuse de envío

```json
{
  "version": 1,
  "type": "status",
  "connectionId": "id-local-de-la-conexion",
  "externalAccountKey": "identificador-real-de-la-cuenta",
  "generation": 1,
  "eventId": "id-estable-del-callback-de-estado",
  "messageId": "id-local-del-mensaje-enviado",
  "status": "READ"
}
```

Estados: SENT, DELIVERED, READ, FAILED. Debe corresponder al mensaje saliente de esa cuenta y a su generación **de envío**. Acuses de una generación anterior se admiten después de pausar para conciliar envíos existentes, sin habilitar otro envío. SENT/DELIVERED/READ no retroceden por callbacks atrasados o FAILED tardío; un éxito posterior puede aclarar una aceptación antes incierta. No reutilizar un eventId de SENT para READ.

### Respuestas y recuperación

- 200: procesado o duplicado; el duplicado incluye `duplicate:true`. ACK de App no certifica respuesta/entrega externa.
- 400: contrato/cuenta/generación inválidos; revisar el emisor, no cambiar IDs al azar.
- 401/403: firma inválida o tenant/módulo inactivo.
- 413/429: cuerpo excesivo o límite de 120 eventos/minuto por tenant.
- 503: flag apagado o procesamiento pendiente de recuperación. Conservar el ID estable; no crear otra venta/mensaje por reintentar.

El WebhookEvent guarda `source=channel-v1:<connectionId>`, `eventType=channel.v1`, llave externa `type:eventId`. La recuperación revalida estado actual y generación y mantiene los límites del runner existente. Si el procesamiento ya quedó registrado como fallido, un reenvío puede responder duplicate mientras el cron conserva el trabajo pendiente; revisar su estado, no interpretar duplicate como prueba de entrega. Pausas prolongadas pueden consumir los cinco intentos de ingreso: requiere revisión/reanudación operativa de esos registros, sin borrarlos ni generar nuevas identidades.

## Salida

App envía al path fijo `POST {N8N_BASE_URL}/webhook/channel-outbound-v1`, mediante la firma de plataforma existente `N8N_WEBHOOK_SECRET`. No se permite configurar una URL de destino desde el navegador. Datos adicionales al envelope histórico `organizationId,event=message.send,data`:

```json
{
  "version": 1,
  "connectionId": "id-local-de-la-conexion",
  "externalAccountKey": "identificador-real-de-la-cuenta",
  "credentialRef": "organization",
  "generation": 1,
  "idempotencyKey": "id-local-del-mensaje",
  "conversationId": "id-local-del-hilo",
  "messageId": "id-local-del-mensaje",
  "channel": "whatsapp",
  "contactPhone": "telefono-del-destinatario",
  "content": "Hola"
}
```

App revalida cuenta, salud, módulo, tenant, ruta/estado IA y control humano antes de autorizar el envío. Pausa y admisión de transporte comparten lock de cuenta: si el transporte ya fue admitido, pausar no lo desenvía. La llamada conserva timeout de cinco segundos y las reglas de incertidumbre/handoff existentes. Texto únicamente; los adjuntos de conexiones nuevas se rechazan antes de guardar/enviar el mensaje humano. No se añaden descargas o URLs arbitrarias.

El workflow nuevo debe verificar firma de plataforma y mapping tenant/cuenta; deduplicar duramente por organizationId+connectionId+idempotencyKey; persistir admisión antes de ACK; usar exclusivamente credencial y cuenta revisadas; enviar luego los acuses por el contrato v1. No esperar a completar sincrónicamente un callback que App intenta serializar con la admisión. No reenviar una llamada ambigua a ciegas. Este repositorio no incorpora ni despliega el workflow real del proveedor; esa implementación depende del sandbox elegido.

Conversaciones sin cuenta conservan los paths `whatsapp-outbound` y `<canal>-outbound` y el payload anterior. Una conversación con cuenta **nunca** cae a esos paths si se apaga el flag nuevo: queda bloqueada para envío hasta reactivar/reconciliar. Sus mensajes/historial permanecen visibles.

## Historial anterior y cutover futuro

No se inferirá la cuenta por teléfono ni se reenviará historia para hacer backfill. El gestor dispone de `attachChannelHistory` como contrato de migración revisada: exige conexión verificada/habilitada, conversación propia del mismo canal todavía sin binding, timestamp esperado, hilo externo explícito y confirmación. Rechaza trabajo AI recuperable y mensajes PENDING; conserva IDs/mensajes, deja auditoría y no crea otra conversación. Los mensajes salientes históricos mantienen sus callbacks legacy; los nuevos quedan marcados por generación y exigen callback v1.

Antes de habilitar el flag debe desplegarse el binario de Fase 3, todavía con el flag apagado, en todos los procesos web y cron/runners. Verificar sus commits; no admitir bindings mientras sobreviva un sender anterior, que no conoce cuentas. El lock compatible protege hilos legacy durante el despliegue, no convierte al binario anterior en un sender v1.

Antes de usarlo en un entorno real: detener nuevas entregas del flujo anterior para esa cuenta, drenar ingreso/jobs y revisar envíos inciertos, comparar inventario, vincular solo historias confirmadas y arrancar una única entrada v1. No enviar ambos contratos para el mismo mensaje. Un binding incorrecto no se arregla reasignando la cuenta o borrando historial: pausar y revisar. La herramienta no modifica cuentas reales en esta entrega ni tiene un backfill automático global.

## Rollback

Para cuentas nuevas, pausar por cuenta conserva recepción de acuses tardíos mientras el flag siga encendido. Apagar el flag global detiene todo el endpoint v1 y envíos vinculados; el conector debe preservar/reintentar sus eventos. Se conserva el funcionamiento legacy de hilos sin binding. No ejecutar DROP/down ni restaurar una BD antigua. No volver directamente a un binario anterior con hilos vinculados: ignoraría sus cuentas y podría enviar por el transporte legacy. Conciliar y aislar esos hilos primero, con un procedimiento revisado en staging.

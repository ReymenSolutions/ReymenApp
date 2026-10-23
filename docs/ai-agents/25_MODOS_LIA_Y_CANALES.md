# Modos de Lía, respuesta humana y Canales

2026-10-23. Implementación exclusiva del piloto privado de staging. No habilita conexiones comerciales ni despliega producción.

## Modos

- **Desactivado (OFF):** no genera ni envía IA. La respuesta humana con texto libre sigue disponible.
- **Con aprobación (SUGGEST):** conserva el flujo actual: el operador solicita el borrador, acepta su costo, revisa, edita y aprueba el envío. Nunca responde sin aprobación. Es el valor de compatibilidad cuando aún no existe configuración.
- **Autónomo (AUTO):** una persona con permisos de administración acepta expresamente datos ficticios, consumo y envío sin revisión previa. Los mensajes nuevos crean trabajo durable y Lía genera y publica la respuesta sin necesitar una ventana del operador abierta. Ante petición humana, fuentes insuficientes, fallo del proveedor o respuesta insegura se deriva a una persona.

El modo se configura en **Canales → Website Chat → Lía · piloto privado** o dentro de la conversación. Afecta todas las conversaciones privadas del negocio. No reutiliza las preferencias de canales comerciales del asistente anterior: se identifican por separado dentro de la misma tarjeta. Activar AUTO se aplica a mensajes nuevos; no vuelve a generar para mensajes ya procesados.

Se conservan $25 MXN diarios, $500 por ciclo mensual y $1 por turno, con controles globales de presupuesto. No se activan otros agentes ni se añaden proveedores, brokers o dependencias.

## Respuesta humana

En «Escribir una respuesta humana» se puede solicitar «Utilizar respuesta recomendada por IA», aceptar el consumo y revisar la recomendación. Insertarla en el editor no la envía. Se puede editar o elegir «Escribir texto libre». La confirmación final de envío sigue siendo obligatoria.

Solicitar una recomendación toma control humano y bloquea cualquier respuesta automática del turno. Solo perfiles autorizados pueden consumir IA. OFF también deshabilita recomendaciones nuevas. Un mismo mensaje mantiene una única generación: si el turno ya se generó o se invalidó, no hay replay pagado; se continúa con texto libre o un mensaje nuevo del visitante. Pedir una persona no produce una llamada al proveedor.

## Canales unificados

Se muestran seis tarjetas: WhatsApp, Instagram, Messenger, Website Chat, Email y Enquiries. Cada una contiene estado, última actividad, modo y opciones de conexión; el número de WhatsApp también vive en su tarjeta. La configuración de cuentas se despliega en «Administrar conexión». Registrar una cuenta no verifica su conexión. Las comprobaciones de salud, rutas, permisos y contratos de los conectores se conservan.

Los nombres visibles anteriores Off/Suggest/Automatic pasan a Disabled/With approval/Autonomous en inglés y Desactivado/Con aprobación/Autónomo en español; los valores persistidos permanecen OFF/SUGGEST/AUTO.

## Persistencia y límites de carrera

`MarkChatSettings` separa el modo del piloto de snapshots v1 inmutables. Es por organización, con actor y versión. `MarkChatTurn` añade versión de modo y propósito explícito (automático o recomendación humana). Migración aditiva `20261126090000_mark_chat_modes`; no elimina ni transforma datos existentes.

Cambiar el modo bloquea las conversaciones del piloto, incrementa sus revisiones y cancela borradores pendientes. No libera el control humano. El gateway y el envío revalidan modo, revisión, actor, permisos, último mensaje y fuentes. Si alguien toma control y lo devuelve durante una llamada, el resultado anterior no sale; el costo incurrido se conserva.

El trabajo automático usa la bandeja PostgreSQL `WebhookEvent`, source `ai-center`, eventType `ai.mark_private_chat`. Se inserta en la misma transacción del mensaje. `after()` acelera la ejecución, pero no es la única recuperación. El POST de recuperación `/api/cron/mark-chat` exige staging, bandera privada y CRON_SECRET. No depende de consultas/polling del navegador para llamar al modelo.

Solo se reclama una vez la generación; nunca se repite una llamada cuyo resultado sea incierto. Una reclamación interrumpida por más de cinco minutos se cierra y deriva a atención humana, sin liberar reservas financieras desconocidas. El mensaje automático y la finalización del trabajo se confirman en la misma transacción. Una nueva petición, modo, enlace o intervención invalida la respuesta anterior. No se usa n8n para transportar el chat privado.

## Actualización de staging y recuperación

Construir y migrar únicamente `/home/emilianorm/reymen-mark-staging`, arrancar con `deploy/staging/chat.sh start`. Instalar el cron privado con `sudo bash deploy/staging/chat-cron.sh install`: añade exclusivamente `/etc/cron.d/reymen-mark-staging`, cada minuto, con nombre fijo de contenedor de staging. No modifica el cron de producción. El script ejecutado dentro del contenedor obtiene CRON_SECRET de su entorno y no lo imprime ni lo pone en argumentos.

Mantener el túnel Termius; abrir `http://localhost:3301/portal/ai-channels`. Como propietario del negocio ficticio seleccionar el modo de Lía y guardar. Para AUTO aceptar el consentimiento mostrado, abrir un visitante del piloto y enviar una pregunta ficticia nueva sobre una fuente publicada. Debe responder sin abrir al operador. Pedir después una persona: no debe responder la IA. Probar también OFF, recomendación humana y edición libre.

Rollback: `deploy/staging/review.sh start` apaga el chat; `deploy/staging/run.sh start` apaga también revisión pagada. El cron privado termina sin efectos si la bandera está apagada. Conservar tablas, mensajes, costos y trabajos; no revertir la migración eliminando datos. En el binario anterior estos campos son aditivos y se ignoran, dejando el flujo previo de aprobación.

## Validación

Las pruebas usan datos locales sintéticos y proveedores simulados; no utilizan la clave del usuario. Cubren admisión única, cambios de modo durante llamada, control humano, falta de fuentes, respuestas inseguras, pérdida de permisos, presupuesto agotado, recuperación sin replay y recomendaciones que requieren aprobación. Browser valida seis tarjetas, persistencia del modo, consentimiento y pantallas pequeñas. La prueba pagada de calidad debe realizarla el operador en staging; no es un despliegue público ni habilita CRM con identidad verificada.

Evidencia local: suite completa 228 archivos / 1,622 pruebas aprobadas; regresiones adicionales de cobro incierto y conservación del editor verificadas en suites focalizadas (37 pruebas de servicio/controles/cron y 9 de interfaz). Build y tipos aprobados; lint sin errores y 63 advertencias existentes. Cinco comprobaciones de scripts/configuración aprobadas. Chromium: 4 escenarios aprobados y uno omitido por requerir bandera apagada; cubren registro/verificación/pausa de conexión, seis tarjetas, modos persistidos, consentimiento, control humano y anchos 320/390/768. Proveedores y datos simulados; sin consumo real ni cambios del VPS.

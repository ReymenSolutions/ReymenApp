# Lía: Website Chat privado con aprobación humana

Fecha: 2026-10-23. Continuación del piloto de revisión de `23_MARK_REVISION_PRIVADA_ANTHROPIC.md`. Esta implementación no despliega producción ni activa canales comerciales.

## Nombres actuales

| Nombre | Especialidad |
| --- | --- |
| Lía | Atención y ventas |
| Sol | Soporte |
| Nodo | Operaciones |
| Atlas | Investigación |
| Nova | Marketing y contenido |

Esta tabla sustituye los nombres propuestos en los documentos históricos. Mark pasa a mostrarse como Lía en pruebas, administración, fuentes y borradores. Los identificadores `mark`, rutas, banderas y snapshots v1 mantienen su valor para conservar instancias, permisos, costos y trazas existentes. La configuración inmutable v1 conserva `publicName: Mark`; no editarla ni recalcular sus hashes. Las instancias nuevas usan Lía; las antiguas se muestran mediante un alias. Los nombres personalizados del asistente existente se conservan. El catálogo de especialidades no crea ni activa runtimes para Sol, Nodo, Atlas o Nova.

## Comportamiento

Un administrador del negocio crea una conversación privada y un enlace de visitante de una hora. Solo se persiste el hash del secreto; el enlace lo entrega la creación una vez. Renovarlo invalida el anterior y los borradores pendientes. El secreto viaja en el fragmento del navegador y en Authorization, nunca en el query string. Cualquier persona con el enlace puede acceder a esa conversación sintética durante su vigencia: no compartirlo públicamente.

El visitante escribe datos ficticios. Los mensajes aparecen en Conversaciones. Recibir o consultar mensajes no genera respuestas de IA. «Quiero hablar con una persona» deriva determinísticamente a atención humana sin llamar al proveedor. Un operador solicita explícitamente cada borrador y acepta su costo; revisa y puede editar el texto antes de aprobar su envío. La respuesta se publica como mensaje AGENT en este chat, sin n8n ni transporte comercial. SENT confirma persistencia para el transporte privado, no lectura del visitante.

Cada mensaje admite una sola generación; no existe reintento automático del proveedor. Repetir la recepción o confirmar un envío con la misma llave no duplica mensajes. La ventana consulta el estado cada 2.5 segundos. Un borrador nunca aparece al visitante antes de la aprobación.

Se mantienen $25 MXN diarios, $500 por ciclo mensual y $1 por turno, con presupuesto global y tarifa/FX vigentes. Un fallo ambiguo retiene la reserva y pausa admisiones; se concilia en administración con evidencia. El cambio de nombre no modifica tarifas ni límites.

## Seguridad y concurrencia

- Organización y usuario se derivan de sesión; rol, estado activo y módulo se revalidan en servidor. Las capacidades de visitante están vinculadas a su creador activo.
- Se bloquea la fila Conversation antes del presupuesto y del conocimiento. La revisión del turno se comprueba al reclamar el costo, al guardar el resultado y al aprobar el envío.
- Tomar control humano, asignar, cerrar, revocar, renovar enlace o recibir otro mensaje incrementa la revisión e invalida borradores. Tomar y devolver control durante una generación también invalida su resultado.
- Los costos ya incurridos se registran aunque el resultado llegue tarde y sea descartado. No se libera incertidumbre para permitir otro cobro.
- El flujo comercial legacy y su transporte rechazan conversaciones marcadas como privadas incluso si se apaga la bandera.
- La API limita cuerpo a 4096 bytes, texto a 500 caracteres, 120 solicitudes/minuto por hash de capacidad y 200 mensajes entrantes por conversación. Creación: 10 conversaciones/hora por organización. Enlaces: 256 bits, TTL una hora.
- Tras cinco minutos un operador puede recuperar una generación interrumpida como FAILED y derivarla a una persona. No llama de nuevo al proveedor ni reabre una conversación cerrada.

## Archivos y esquema

- `src/lib/ai/pilot/chat.ts`: servicio privado, admisión, control humano, envío, recuperación.
- `pilot/review.ts`, `pilot/gateway.ts`: vínculo a turno durable y revalidación antes de llamar.
- `src/actions/mark-private-chat.ts`, `/api/mark-chat`, `/mark-chat`, `/portal/mark-chat-pilot`: endpoints y pantallas privadas.
- `MarkChatLauncher`, `MarkChatVisitor`, `MarkChatReviewPanel`: interfaz operador/visitante.
- Conversaciones, draft legacy y transporte: protecciones contra caída accidental al flujo comercial.
- `agents/identities.ts`, componentes de prueba/admin y conocimiento: nombres visibles y compatibilidad.
- `20261125090000_mark_private_chat`: dos tablas nuevas, índices y FK compuestas para organización/conversación/mensaje/borrador. No borra ni transforma registros. Requiere aplicar migración antes de arrancar esta versión.
- `docker-compose.staging-chat.yml`, `deploy/staging/chat.sh`: activación explícita adicional al overlay de revisión. Base y review mantienen chat apagado.

## Validación en staging

No repetir bootstrap, init ni restaurar producción. Revisar primero el estado del checkout y respaldar la base **de staging**. Actualizar únicamente `/home/emilianorm/reymen-mark-staging`; construir, ejecutar migrate sobre su servicio tools y arrancar con `bash deploy/staging/chat.sh start`. Consultar `/api/health` por el túnel local.

1. Como owner del negocio sintético, abrir `http://localhost:3301/portal/mark-chat-pilot` y confirmar datos ficticios.
2. Crear conversación, conservar enlace, abrir visitante y operador en pestañas separadas.
3. Visitante: preguntar horario. Operador: aceptar costo y generar, comprobar fuentes y costo; el visitante aún no debe ver respuesta. Revisar, aprobar y comprobar una sola entrega.
4. Devolver a IA para un nuevo turno; pedir una persona desde visitante. Debe aparecer atención humana sin generar ni cobrar. Responder desde el editor humano.
5. Durante una generación tomar control y devolverlo: no debe reaparecer el borrador viejo. El costo real del intento se conserva.
6. Revocar enlace: visitante deja de consultar; el historial sigue en CRM. Probar cuenta viewer y otro negocio: no pueden escribir ni cruzar conversaciones.

## Pruebas automatizadas

Validación local: suite completa 223 archivos / 1,588 pruebas aprobadas (concurrencia limitada a 3 workers y timeout 30 s por recursos del entorno). Primera corrida con timeout por defecto mostró dos timeouts de bcrypt y tres traducciones faltantes; se añadieron las traducciones y se repitió la suite con éxito. Una prueba posterior protege además el historial al desactivar el chat. Compilación y TypeScript aprobados; lint sin errores, con 51 advertencias preexistentes. Esquema PostgreSQL local coincide con Prisma tras aplicar las 90 migraciones desde cero. Cinco verificaciones de scripts/configuración aprobadas. Chromium aprobó el flujo visitante → atención humana → respuesta → revocación, con anchos 320/390/768; las pruebas administrativas y de asignación de fuentes también pasaron. La primera corrida browser detectó una redirección de visitante al login, corregida mediante rutas exactas con autenticación de capacidad en la API. Las pruebas de integración utilizan PostgreSQL local desechable y Anthropic/FX/n8n simulados; no consumen la clave del usuario. Browser verifica solicitud humana, respuesta manual, revocación, ancho móvil y bandera apagada. No sustituye la prueba pagada privada ni una evaluación de calidad de respuestas.

## Rollback y límites

`sudo bash deploy/staging/review.sh start` apaga chat conservando revisión pagada. `sudo bash deploy/staging/run.sh start` apaga también revisión pagada y salida del proveedor. No revertir migraciones ni eliminar tablas: conservar conversaciones, trazas y reservas. Para rollback de binario usar la versión anterior con esquema aditivo conservado; los enlaces privados dejan de funcionar. No iniciar workers comerciales sobre conversaciones del piloto.

No incluye identidad CRM verificada ni consultas a compras, respuestas automáticas públicas, memoria multi-turno del modelo, integración del widget comercial o activación de los otros agentes. Cada borrador considera el último mensaje y fuentes publicadas autorizadas. Los textos del operador/visitante se guardan en la conversación sintética: utilizar exclusivamente datos ficticios.

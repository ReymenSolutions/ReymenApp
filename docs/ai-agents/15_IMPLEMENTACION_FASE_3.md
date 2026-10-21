# 15 — Fase 3: base de conexiones y routing por cuenta

Fecha: 21 de octubre de 2026, America/Mexico_City. Rama: `codex/ai-center-phase3-channels`. Base: `f466261`, cierre de Fase 2.

Autorización: «continua con la siguiente fase». Después, el propietario pidió continuar con todo lo posible y posponer la elección del canal piloto. Se implementó y validó la base local común. **El piloto con proveedor real queda pendiente; no se seleccionó un negocio/cuenta ni se declara completo el gate externo de Fase 3.**

## 1. Resultado y alcance

- Registro de cuentas por organización/canal, sin credenciales en navegador y en pausa por defecto.
- Ruta default única por cuenta al asistente legacy activo, o atención manual. No se activan especialistas, cupos nuevos ni modos de canal.
- Contrato v1 independiente para salud, mensaje entrante y acuse. HMAC por organización, cuenta/generación explícitas, cuerpo limitado y eventos idempotentes.
- Separación de conversaciones por cuenta/hilo; compatibilidad con los canales e ingreso existentes.
- Control de propiedad: una cuenta confirmada no puede quedar verificada en dos organizaciones; las inscripciones sin verificar no reservan IDs ajenos.
- Admisión de envío por cuenta serializada contra pausa; revalidación de ruta/salud/control humano después de inferencia.
- Vinculación explícita y revisada de historia legacy, conservando IDs/mensajes, sin backfill automático por teléfono.
- Interfaz para registro, consulta de estado, asignación/manual y pausa. Flag apagado por defecto.

No se modificaron producción, VPS, credenciales, workflows desplegados, planes, ledger, POS/Lealtad ni datos reales. No se instalaron dependencias, Redis, brokers o microservicios. No se implementaron OAuth, Mark, Alex, herramientas, marketplace ni Fase 4.

## 2. Evidencia y diferencias frente al diseño

Se revisaron 04/06/07/09/10/11, el contrato de Inbox, esquema, ingreso/reintentos, jobs de Fase 0, adapter de Fase 1 y UI de Fase 2. El código existente distinguía organización y canal, pero no cuentas dentro de un canal; la búsqueda por teléfono/handle podía mezclar esas cuentas. El número libre de WhatsApp no prueba identidad o propiedad de una cuenta externa.

El contrato real de n8n y sus credenciales no están disponibles en este checkout: solo hay workflows parciales y el contrato App↔conector. Por ello no se presenta un conector físico como probado. El nuevo path queda separado del legado; que n8n ignore un campo nuevo no puede terminar enviando por otra cuenta.

El diseño propone rutas por intención/prioridad y múltiples especialistas. En esta entrega solo existe el asistente legacy autorizado. Se implementa una ruta default no ambigua por cuenta, conservando OFF/SUGGEST/AUTO y derechos actuales por canal. No se inventa clasificación por intención ni agentes destino inexistentes; corresponde al futuro runtime/especialistas. AG-009 queda implementada en su base local, con cutover/conector real todavía pendiente.

## 3. Datos y migraciones

Migraciones nuevas:

1. `20261116092000_channel_connections_phase3`: enum ChannelConnectionState, tablas ChannelConnection/ChannelRouting, dos campos nullable en Conversation e índices/FKs/checks.
2. `20261116093000_channel_verified_account_ownership`: índice único parcial de channel+externalAccountKey cuando providerVerified=true.

Se aplicaron las **80 migraciones** únicamente en bases nuevas, vacías y sintéticas. No se ejecutó una migración sobre bases reales. El nombre de las migraciones continúa la secuencia existente del repositorio; no representa fecha de despliegue.

ChannelConnection conserva referencia de credencial, cuenta externa, etiqueta, estado, versión CAS, generación, secuencia/fecha de salud y capacidades declaradas. ChannelRouting tiene una sola fila por conexión, referencia compuesta al agente propio, versión y habilitación. Seleccionar atención manual deshabilita la ruta sin borrar su registro. Las FKs compuestas impiden rutas/conversaciones cruzadas entre tenants. No hay borrados en cascada de historia.

Conversation añade channelConnectionId/externalThreadId, ambos null para historia legacy. Un check exige que ambos estén presentes o ausentes; una clave única identifica el hilo por cuenta. Ningún ID/mensaje/contacto antiguo se reescribe por migrar. La propiedad confirmada entre tenants tiene además lock por cuenta y constraint SQL; el índice parcial se administra explícitamente en SQL, no por una capacidad no soportada de Prisma schema.

**Orden de despliegue futuro:** expandir esquema antes de ejecutar este binario. Mantener el flag apagado hasta verificar que todos los procesos web y cron/runners usan Fase 3; ningún proceso anterior debe seguir activo al admitir cuentas/historial vinculado. A diferencia de las tablas independientes de Fase 1, las lecturas Prisma de Conversation incluyen las columnas nuevas incluso con el flag apagado: **código nuevo sobre esquema de Fase 2 no está soportado**. Código anterior sí puede leer el esquema expandido para hilos legacy, pero no es un rollback seguro después de vincular cuentas: podría ignorarlas al enviar. Medir locks/tiempo del índice y los checks de Conversation en una copia representativa antes de aprobar producción.

## 4. Contrato, seguridad y confiabilidad

Especificación reproducible: [CANAL-CONEXIONES-V1](../crm/CANAL-CONEXIONES-V1.md).

- `POST /api/webhooks/n8n/channels` no reemplaza rutas existentes. Exige HMAC reciente aun en desarrollo, tenant activo y acceso a Inbox (CRM o AI_WHATSAPP), cuenta propia y generación. La admisión/ejecución de IA sigue exigiendo AI_WHATSAPP activo; suspender solo IA no bloquea la atención manual incluida en CRM. Rechaza campos adicionales/secretos, JSON inválido y cuerpo >64 KiB; limita a 120 eventos/minuto por organización.
- EventId está firmado en el cuerpo. Para mensajes debe coincidir con el ID estable del proveedor; no puede cambiar con la ejecución de n8n. WebhookEvent usa source por conexión y llave tipo:eventId. Se reutilizan dedup, reintentos y cron existentes, revalidando tenant/cuenta/generación al recuperar.
- Estado saludable significa reporte reciente del conector con cuenta verificada y ambas capacidades. Vence a los cinco minutos; una secuencia vieja no reemplaza otra nueva. El conector debe hacer verificación/renovación real según límites del proveedor. App no instala ese sondeo ni acredita por sí sola scopes/propiedad externos.
- Registrar una cuenta no la verifica ni la habilita. Pausar una cuenta habilitada cambia generación, invalida salud y detiene nuevas admisiones. Reiniciar verificación está disponible en cuentas pausadas, sin borrar/recrear la cuenta. No desenvía un mensaje ya admitido.
- Mensajes salientes vinculados usan exclusivamente `channel-outbound-v1`, cuenta explícita, referencia privada y llave idempotente por mensaje. El conector debe implementar dedup durable/ACK y mappings revisados. Las conexiones nuevas admiten texto; se rechazan adjuntos, sin incorporar downloads/URLs libres.
- AUTO comparte el lock de Conversation con control humano y el de cuenta con pausa/routing, antes del efecto externo. Un fallo incierto no provoca reenvío automático. Los workers de Fase 0 continúan siendo autoridad; after() acelera y cron recupera.
- Acuses v1 comprueban mensaje/cuenta/generación de envío. READ no retrocede a SENT/FAILED. Se permiten acuses de un envío anterior después de pausar, sin reactivar mensajes nuevos. Los salientes legacy conservan el callback anterior, incluso si se vinculó explícitamente su historia; los salientes nuevos quedan marcados por generación desde creación.
- Las acciones derivan tenant/actor de sesión, exigen knowledge_base:manage, AI_WHATSAPP activo y organización activa. Inputs estrictos y CAS evitan IDs ajenos y escrituras competidoras. No se entregan credenciales/referencias privadas ni account keys guardadas en el lector para navegador.

La confianza sigue siendo n8n como servicio del servidor: una firma App↔n8n no sustituye verificar la firma del proveedor en ese borde. Este último punto necesita el sandbox/export saneado del canal escogido. El secreto de organización no debe llegar al navegador/POS físico.

## 5. Historial y compatibilidad

El teléfono/correo siguen enlazando al mismo contacto del CRM, mientras el hilo se distingue por cuenta. Los handles sin teléfono/correo se distinguen por cuenta. La llave de lock de identidad sin binding conserva exactamente el formato de Fase 2, comprobado con dos sesiones PostgreSQL que simulan coexistencia; no se ejecutó un binario antiguo completo. Las búsquedas legacy excluyen conversaciones vinculadas; un ID explícito de conversación vinculada no puede entrar por el endpoint antiguo. Se vuelve a leer el binding bajo lock para no añadir mensajes legacy a una historia que se vinculó mientras esperaba.

`attachChannelHistory` es un contrato privilegiado de migración revisada, no un backfill global ni una acción autónoma de IA. Requiere cuenta habilitada/verificada del mismo canal, conversación propia aún sin binding, updatedAt esperado, hilo externo explícito y confirmación. Rechaza mensajes PENDING y trabajo AI pendiente/recuperable. Conserva mensajes/ID y crea auditoría. Su uso real requiere inventario, revisión por operador, drenado de entradas y autorización de staging/producción; no se vinculó ninguna conversación real.

Hilos sin cuenta mantienen payload, sender, modos, permisos y derechos anteriores. Se añaden consultas de binding y guardias necesarias; no se cambia el comportamiento comercial por activar un especialista. El pipeline legacy conserva su motor; solo los hilos vinculados consultan elegibilidad de cuenta/ruta. Se preserva el acceso manual del Inbox con CRM aunque IA esté suspendida; la configuración de cuentas continúa bajo el permiso/módulo de gestión IA. No se añade atribución de costo por cuenta, revisión efectiva de routing en AgentConfigRevision, grants o runtime nuevo. El ledger conserva su contrato.

## 6. Interfaz

En Canales, únicamente los gestores ven el registro y configuración de cuentas bajo el flag nuevo. El formulario pide nombre/canal/identificador de proveedor, sin token ni password; conserva lo escrito ante fallos. Actualizar estado recupera evidencia reciente. Habilitar se ofrece después de verificación válida; se explica que registrar no conecta y que pausar exige otra verificación.

La lista distingue atención manual, asistente activo y asistente no disponible; no ofrece destinos pausados. El historial por canal se presenta aparte y no se usa como prueba de conexión. Los controles conservan targets de 44px, textos ES/EN, wrap y diseño móvil. No se añaden pantallas de OAuth o reconexión que no funcionen. Asignar una cuenta requiere una instancia legacy previamente preparada con el contrato revisado de Fase 1 y su hash esperado; no se materializa/backfillea silenciosamente al abrir esta pantalla. Sin esa preparación se conserva atención manual.

## 7. Archivos

- `prisma/schema.prisma` y las dos migraciones: expansión e invariantes SQL.
- `src/lib/channel-connections/{service,events,outbound}.ts`: contratos internos, salud, CAS, routing/binding y transporte versionado.
- `src/actions/channel-connections.ts`: listado seguro, registro, configuración y vinculación explícita de historia.
- `src/app/api/webhooks/n8n/channels/route.ts`: ingreso firmado, tamaño/límite, dedup y scheduling existente.
- `src/lib/{webhook-processors,ai-auto-jobs,ai-auto-reply,ai-pipeline}.ts`: aislamiento de hilo y revalidación del runtime existente.
- `src/actions/conversations.ts`: guardia y envío humano por cuenta, sin fallback a otra cuenta.
- `src/components/portal/ai-center/Connections.tsx` y página `ai-channels`: UI detrás del flag.
- `.env.example`, traducciones, dos suites nuevas y `e2e/channel-connections.spec.ts`.
- Contrato CRM y seguimiento en docs/ai-agents.

## 8. Pruebas y validación

Entorno: Node24, Prisma6.19.3, PostgreSQL16 local sin puertos publicados, socket Unix. Bases independientes `reymen_ai_phase3_test` para verificaciones focales y `reymen_ai_phase3_e2e` para navegador. La regresión completa final usa además una base recién creada, `reymen_ai_phase3_final_test`, migrada desde cero para no reutilizar estado de corridas interrumpidas. Solo fixtures sintéticos. Proveedor y transporte mock/deshabilitados. No se consultaron canales externos.

Los casos focales cubren roles denegados, tenant/módulo inactivo, IDOR y FKs, CAS concurrente, propiedad de cuenta entre tenants, secuencias/TTL/generación, historia preservada y revisión obsoleta, trabajo pendiente, mensajes duplicados con envelope reescrito, dos cuentas/mismo contacto, CRM compartido, callbacks legacy/v1, estados monotónicos, media bloqueada, workers concurrentes, pausa/toma humana durante inferencia y pausa bloqueada durante admisión de transporte.

| Comprobación | Resultado |
|---|---|
| Esquema | Prisma validate/generate aprobados; 80 migraciones aplicadas desde cero en bases desechables |
| Comparación de esquema | Diff de solo lectura contra la base migrada vacío; el índice parcial y checks SQL se mantienen explícitamente |
| Focales de runtime/canales | 95/95 aprobadas en cinco archivos: nuevas garantías y regresión de ingreso/control humano existentes |
| Regresión final completa | **195/195 archivos, 1341/1341 pruebas aprobadas**, 308.49 s; base nueva migrada desde cero, un worker y tres flags apagados. Incluye las 32 pruebas nuevas de Fase 3 |
| Build | Compilación y TypeScript del build aprobados con los tres flags encendidos; sin despliegue |
| TypeScript independiente | `npx tsc --noEmit --incremental false` aprobado sobre la versión final |
| Lint completo | 0 errores, 51 advertencias preexistentes |
| Chromium, UI y compatibilidad | 18/18 aprobadas sobre el código final, 1.3 min: Fase 2, registro/verificación/routing/pausa, inbox, respuesta manual/control humano, Rulebook y cron |
| Repetición de cuentas | 2/2 aprobadas sobre build posterior, 12.4 s; formulario, permisos, anchos 320/390/768/1280 y captura móvil inspeccionada |
| Rollback independiente | 1/1 aprobada, 5.8 s; solo cuentas apagadas conserva Canales anterior y endpoint v1 503 |
| Rollback completo de UI/modelo | 2/2 aprobadas, 11.9 s; mismo binario con todos los flags apagados, navegación anterior y Rulebook |

Commits funcionales: `a49e02e` (datos/contratos), `65f480f` (ingreso/envío/pruebas), `e473eae` (interfaz), `91392f3` (continuidad CRM sin IA) y `04e7599` (locks compatibles y límites). El cierre documental se conserva separado.

La revisión de compatibilidad verificó dos puntos adicionales antes del cierre: no bloquear atención manual de CRM al suspender IA, y conservar el lock de identidad original para coexistir con procesos anteriores. Se interrumpieron las corridas completas que aún estaban en curso para incluir esas correcciones en la regresión final, sin relajar assertions ni aumentar timeouts comerciales. El frontend se probó con mensajes/cuentas sintéticos, no contra un proveedor. Falta CI Node22, dispositivos físicos/lector de pantalla, carga productiva, firma real del proveedor, ventanas, scopes, expiración/reconexión y mapping real de credenciales.

Validación local reproducible:

1. Crear **dos bases desechables** distintas; configurar DATABASE_URL y TEST_DATABASE_URL sin usar datos habituales. Aplicar allí las 80 migraciones; prisma validate/generate.
2. Correr `npm test -- --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000` con ambos URLs unitarios, claves externas vacías, transporte mock y flags globales apagados. Las suites específicas habilitan sus flags solo dentro de fixtures.
3. Ejecutar TypeScript sin incremental, lint y build local; evitar compilar al mismo tiempo que la suite completa en un entorno compartido.
4. Levantar build en loopback con los tres flags habilitados y base E2E. Ejecutar `e2e/channel-connections.spec.ts`, Fase 2, Rulebook, inbox, respuesta manual/control humano y cron, un worker.
5. Reiniciar el mismo build con AI_CHANNEL_CONNECTIONS_ENABLED=false; comprobar cuentas ocultas y ruta v1 503. Reiniciar también con ambos flags de fases anteriores apagados y ejecutar el rollback existente. No revertir esquema ni borrar historia.

## 9. Riesgos y pendientes

- **Piloto no elegido:** el propietario pidió posponer la pregunta. Se retomará al preparar sandbox/cutover. Los fixtures WhatsApp no representan selección de un negocio o canal productivo.
- **Conector físico pendiente:** se necesita un workflow sandbox revisado que verifique cuenta/firmas/scopes/ventanas y cumpla el contrato de envío/dedup/ACK/callbacks. Las pruebas mock no validan entrega externa ni propiedades de Meta/email. No activar cuentas reales siguiendo solo este reporte.
- **Routing de especialistas pendiente:** solo default al legacy; intención/prioridad y otros agentes no se habilitan anticipadamente. No comenzar Mark/Alex por existir una cuenta.
- **Caché/operación:** el estado de la pantalla se actualiza al recargar/actualizar; el backend vuelve a validar al enviar. Cortes de BD/cron y pausas largas requieren conciliación manual de eventos que agoten reintentos. No borrar/recrear esos eventos para ocultar errores.
- **CRM:** permanecen los límites de atomicidad del pipeline legacy documentados en Fase 0; la comprobación de cuenta antes/después de inferencia no convierte sus múltiples writes en un único commit con la pausa. No se presenta como resuelto por este routing.
- **Despliegue:** expandir esquema primero; ensayar locks en copia y respaldo/restauración reciente. No se midió volumen productivo. No hay preparación automática del servidor ni permisos de producción.
- **Datos/retención:** no se cambian políticas de borrado. Payloads de webhook siguen teniendo PII con la protección/retención existente; acuses y auditoría evitan tokens. Inventario real y política por tipo siguen pendientes.

## 10. Rollback y siguiente paso

`AI_CHANNEL_CONNECTIONS_ENABLED=false` detiene ingreso nuevo y envío vinculado, conserva historia/datos y mantiene hilos sin binding por sus rutas legacy. Para pausar solo una cuenta, usar CAS; sus acuses tardíos pueden seguir llegando mientras el flag global esté encendido. No reasignar un hilo vinculado al transporte antiguo ni restaurar una copia vieja. Conservar las dos migraciones y correcciones de Fases 0/1.

Antes de volver a un binario anterior a Fase 3 se deben pausar/drenar y aislar las conversaciones vinculadas: el código viejo desconoce su cuenta. No hay down destructivo ni unlink automático; cualquier desvinculación real necesita revisión específica de identidad, mensajes pendientes y mapeo. El rollback preferido es el flag dentro del binario nuevo.

La siguiente acción operativa es elegir el piloto cuando el propietario pueda, obtener contrato/export saneado del sandbox y validar extremo a extremo sin modificar producción. Hasta cumplir esos gates no se recomienda cutover. Esta entrega no inicia Fase 4 ni solicita desplegar.

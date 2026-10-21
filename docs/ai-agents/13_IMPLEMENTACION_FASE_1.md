# 13 — Fase 1: modelo de agentes y compatibilidad

Fecha: 20 de octubre de 2026, America/Mexico_City. Rama: `codex/ai-center-phase1-model`. Base: `4ddb482`, entrega de Fase 0. Autorización: «continua fase 1».

## 1. Alcance implementado

Se implementó la base de AG-008 y la representación de ejecución de AG-003 usando el runtime endurecido en Fase 0. Incluye definición/instancia, adapter legacy, revisiones de configuración, inventario/dry-run, backfill idempotente, flags, contratos internos y trazas persistentes. Se preservan los derechos por canal existentes.

La fase no activa especialistas: la única definición publicada por el código es `legacy-assistant@1`. No incluye Mark, Alex, marketplace, interfaz multiagente, conexiones/routing nuevos, herramientas, grants, aprobaciones ni cambios de facturación. La Fase 2 no se inició.

No hubo despliegue, acceso al VPS ni cambios de datos reales. La migración solo se aplicó en una base nueva de pruebas. Los datos históricos no se eliminaron ni reescribieron.

## 2. Modelo aditivo

| Tabla nueva | Contrato |
|---|---|
| AgentDefinition | Registro global versionado; manifiesto sin secretos/datos privados. No se sobrescribe al hacer backfill y se rechaza una definición incompatible |
| AgentInstance | Una representación legacy por organización/definición; nombre, referencia histórica y configVersion. Su estado LEGACY no equivale a activar un canal |
| AgentConfigRevision | Snapshot privado insert-only desde el servicio; clave compuesta organización/instancia/versión. Revisiones anteriores no se actualizan |
| AgentModelRollout | Observación por organización, apagada por defecto |
| AgentExecution | Raíz única por organización/conversación/mensaje/operación y por trabajo legado; referencia fija a una revisión, estado, intentos, lease y próximo reintento observados |
| AgentExecutionStep | Pasos únicos por organización/ejecución/key: admisión y generación/dispatch o análisis |

Migración: `prisma/migrations/20261116091000_ai_agent_model_phase1/migration.sql`. Contiene dos enums, seis tablas, índices y FKs. **No añade columnas ni reescribe tablas legacy**. El identificador sigue el orden de las migraciones existentes —que ya tenían nombres posteriores a la fecha de este trabajo— para preservar su secuencia.

Las FKs compuestas impiden asociar una revisión/ejecución/paso a otra organización. Las referencias a Conversation, Message, WebhookEvent y WhatsAppAssistant son IDs legacy validados en consultas con organización al admitir el trabajo; no se añadieron índices o constraints a sus tablas en esta expansión. No son IDs aceptados desde un formulario para crear ejecuciones.

Las nuevas FKs usan RESTRICT para preservar el historial. Una eliminación directa futura de una organización con estos datos necesita un procedimiento específico; no se introdujo borrado en cascada ni política de retención automática.

## 3. Adapter y configuración

`readLegacyConfiguration` obtiene identidad completa (nombre, greeting, personality, capabilities, teléfono e isActive), Rulebook, modos explícitos y efectivos, módulos/derechos actuales y referencias/hash de conocimiento y prompts/versiones históricos. No obtiene credenciales de integración ni copia los textos de KB/prompts al snapshot. Los textos privados de identidad/Rulebook se conservan en la revisión, accesible únicamente al servicio/administradores autorizados.

Un asistente ausente continúa ausente: el nombre de fábrica solo es la representación virtual del comportamiento actual. Un canal sin fila sigue SUGGEST según el default existente. El backfill no crea modos ni modifica isActive, nombre, reglas, planes, maxAiAgents, overrides, mensajes, oportunidades o ledger.

El hash SHA-256 se calcula sobre una representación estable. Dry-run devuelve hash y cantidades; no crea instancia, definición ni rollout. Aplicar exige ese hash revisado. Un cambio detectado exige repetir la comparación. Los backfills concurrentes se serializan por organización y reutilizan la misma instancia/revisión. Cambiar una fuente crea otra revisión; no modifica la anterior. Un ID de asistente reasignado o una definición incompatible requiere revisión, sin remapeo silencioso.

`updateLegacyAgent` comprueba instancia del tenant, configVersion y hash esperados. Dos guardados competidores con valores diferentes no se pisan: solo uno conserva la versión esperada. La escritura de nombre/Rulebook ocurre en sus tablas actuales junto con la revisión, en una transacción. No se añade un segundo escritor comercial.

Los formularios actuales de identidad y Rulebook comparten el bloqueo del modelo cuando el flag global está habilitado y generan una revisión si ya existe representación. Con el flag apagado conservan su llamada legacy sin consultar tablas nuevas. Sus formularios anteriores no enviaban expectedVersion: mantienen esa semántica; la detección explícita de conflicto pertenece al nuevo contrato. Cambios en KB, prompts, modos o derechos se detectan al comparar/admitir el siguiente trabajo; no se reestructuraron sus interfaces ni se añadió un sistema de revisiones de fuentes de Fase 4.

## 4. Ejecución durable sin duplicar efectos

**WebhookEvent y los workers de Fase 0 siguen siendo la única autoridad de ejecución, claims, reintentos, envío y efectos CRM.** AgentExecution observa esos trabajos; no tiene otro worker que vuelva a ejecutar el modelo o el transporte.

Con ambas puertas habilitadas, admisión del mensaje, trabajo de Fase 0 y raíz/paso de observación se guardan en la misma transacción antes del ACK. Una falla de persistencia impide aceptar parcialmente ese mensaje, y permanece disponible el reintento de ingreso existente. La unicidad por operación permite una raíz de reply y otra de análisis para un mismo mensaje, sin contabilizarlas como nuevas llamadas o nuevas conversaciones comerciales.

La revisión de la raíz se fija al admitirla y nunca se cambia por editar la instancia. **Representa la configuración observada en admisión, no una certificación del prompt efectivo ni una reproducción exacta del modelo.** El runtime legacy continúa leyendo sus fuentes actuales; ejecutar una revisión fijada y atribuir el ledger por especialista corresponden al futuro runtime, no a un cutover silencioso de esta fase.

Los observadores actualizan estado al reclamar, al preparar generación/dispatch y al terminar. Releen el trabajo bajo bloqueo de fila para no aplicar estados viejos de un worker anterior. Los pasos no guardan prompts, respuestas, adjuntos, teléfonos ni credenciales; los errores se traducen por allowlist a códigos conocidos. Motivos libres de escalamiento se resumen como `legacy_handoff`.

El cron existente vuelve a conciliar hasta 50 raíces QUEUED/RUNNING por llamada si se interrumpió un observador. No dispara IA ni transporte. Los resúmenes públicos existentes del cron y sus controles de autenticación no cambian. Un fallo de observación posterior al envío se registra para conciliación y no convierte un envío aceptado en otro intento.

Estados: QUEUED, RUNNING, WAITING_HANDOFF, SUCCEEDED, FAILED, CANCELLED. Los tiempos de lease/retry reflejan Fase 0 (lease 10 minutos, esperas 1/5 minutos, máximo tres claims). No se inventa deadline de un trabajo que no lo almacenaba ni hora de finalización si no existe evidencia. WAITING_HANDOFF refleja la derivación ya persistida; no implementa un nuevo sistema de tickets/aprobaciones o el seguimiento de resolución de Fase 6.

## 5. Flags, acciones y permisos

- Global: `AI_AGENT_MODEL_ENABLED=false`, documentado en `.env.example`. Apagado por defecto; no consultar tablas nuevas en las rutas legacy. Primero expandir esquema en un entorno autorizado; habilitar después.
- Tenant: `AgentModelRollout.shadowEnabled=false`. Habilitar solo tras comparar hash; apagar detiene nuevas admisiones observadas y conserva historial. Las raíces ya admitidas pueden seguir conciliándose mientras el flag global esté activo.
- El adapter devuelto sigue siendo `legacy` con cualquier combinación de flags. No se concede ningún nuevo cupo ni se activa automáticamente un canal/especialista.

Acciones de servidor en `src/actions/ai-agents.ts`:

| Acción | Uso |
|---|---|
| listAgentInstances | Representación del asistente propio; funciona con flag global apagado |
| prepareLegacyAgent | Dry-run por defecto; apply opcional con expectedHash revisado |
| updateLegacyAgent | Nombre y Rulebook con ID propio, expectedVersion y expectedHash |
| setAgentObservation | Activar/pausar observación por tenant; no habilita respuestas ni capacidades |
| getAgentExecutionTrace | Metadatos y pasos de una ejecución propia, sin snapshot privado ni referencias de mensajes |

Todas derivan organizationId de sesión, exigen `knowledge_base:manage`, módulo AI_WHATSAPP activo y organización activa. OWNER/MANAGER mantienen el acceso configurado; AGENT/VIEWER/CLIENT/anónimo son denegados. Los inputs son estrictos: no aceptan organizationId, herramientas o grants arbitrarios. El código del modelo es un servicio interno de confianza, no un endpoint que acepte tenant suministrado por el cliente.

No se agregó API externa ni nueva navegación. Las acciones se probaron directamente; su integración visual pertenece a Fase 2.

## 6. Archivos y decisiones frente al diseño original

Commits funcionales: `c09393d` (esquema) y `99b5f4e` (adapter/observación/acciones/pruebas). El commit de cierre documental normaliza únicamente finales de archivo del SQL generado y helper de pruebas, sin cambios de comportamiento.

- `prisma/schema.prisma` y migración: expansión descrita arriba.
- `src/lib/ai/agents/legacy.ts`: lector, inventario y fingerprints.
- `src/lib/ai/agents/model.ts`: definición, sync/revisiones, backfill, CAS, flags y puente transaccional de formularios actuales.
- `src/lib/ai/agents/executions.ts`: observación, redacción y conciliación.
- `src/actions/ai-agents.ts`: contratos autenticados.
- `src/actions/{whatsapp-assistant,rulebook}.ts`: reutilizan el puente de escritura solo bajo flag.
- `src/lib/ai-job-contract.ts`: contratos de trabajos extraídos sin cambio de valores, reexportados desde ai-auto-jobs; evita dependencia circular.
- `src/lib/{ai-auto-jobs,ai-auto-reply,ai-pipeline}.ts`: hooks de observación, sin un segundo sender ni nuevo pipeline.
- `src/app/api/cron/retry-webhooks/route.ts`: conciliación de trazas después de los runners existentes.
- Tres suites nuevas y `src/test/ai-agents-helpers.ts`: fixtures/limpieza exclusiva de bases sintéticas.
- `src/lib/server-messages.ts`: traducciones de errores nuevos al inglés, conforme a las pruebas existentes.
- `.env.example` y documentos de seguimiento.

Se eligió **expand + adapter + shadow**, siguiendo ADR-09. El diseño 04 también describe conexiones, grants, aprobaciones y atribución futura del ledger: no se crean anticipadamente en Fase 1. Las ejecuciones/steps no reemplazan la cola de Fase 0; evitan doble autoridad durante coexistencia. No se migraron conversaciones históricas ni se atribuyó consumo viejo a Mark. No se introdujo un límite comercial de instancias sin decisión del propietario; se conserva el cap por canal como indicaba ADR-02/07.

## 7. Evidencia de validación

Entorno local: Node v24.19.0, Prisma 6.19.3, PostgreSQL 16 en contenedores exclusivos de pruebas. Base **nueva y sintética** `reymen_ai_phase1_test` para las 78 migraciones, y base de Fase 0 `reymen_ai_phase0_test` conservada con sus 77 migraciones para comprobar compatibilidad. Las primeras corridas usaron loopback TCP en el contenedor de Fase 0. Ante fallos intermitentes de conexión se repitió la validación final en un contenedor nuevo sin puertos publicados, mediante socket Unix `/tmp/reymen-phase1-pg-socket`, con las mismas 78 migraciones. La base E2E es independiente. Proveedor/transporte simulados o deshabilitados. Ninguna prueba accede al VPS ni a una cuenta externa real. La comparación de código anterior utiliza una copia fuente de `4ddb482` con las dependencias locales compartidas; no certifica una imagen binaria previamente desplegada en el VPS.

| Comprobación | Resultado |
|---|---|
| Prisma validate / generación de cliente | Esquema válido y cliente generado |
| Migración aditiva | 78 migraciones aplicadas en base vacía desechable; ninguna tabla legacy alterada por la migración nueva |
| Pruebas nuevas | 34 pruebas nuevas y cinco de traducciones: **39/39 aprobadas** en cuatro archivos |
| Código nuevo / esquema viejo / flag apagado | 61/61 pruebas, cinco archivos, aprobadas |
| Código previo Fase 0 / esquema expandido | 61/61 pruebas, cinco archivos, aprobadas usando copia del código 4ddb482 contra la BD expandida |
| Suite completa | **189/189 archivos, 1294/1294 pruebas aprobadas** por socket Unix, 294.92 s; un worker, timeout 60 s y hooks 30 s |
| TypeScript | Aprobado: npx tsc --noEmit --incremental false |
| Lint | Aprobado: 0 errores, 52 advertencias preexistentes |
| Build local | Aprobado: compilación local y 106 páginas estáticas generadas |
| Chromium / interfaz actual | 9/9 aprobadas en Chromium, 24.6 s: Rulebook, inbox, envío manual/control humano y autenticación del cron |
| Diff | Sin errores de whitespace; sin cambios de dependencias, planes, navegación, deploy/ o conectores |

Casos nuevos incluyen: backfill seco y concurrente; asistente ausente/personalizado; hashes/conteos/modos/cap preservados; versiones obsoletas; fuentes modificadas; IDs de otra organización; FKs compuestas negativas; roles y organización suspendida/módulo inactivo; pausa/reanudación por flags; revisiones desde formularios antiguos; ejecución en curso y toma humana; workers competidores con una llamada/un envío; recuperación de generación interrumpida; reparación de observador; redacción de motivos; rollback sin borrar historial.

Una primera ejecución encontró una incompatibilidad del driver con el retorno PostgreSQL `void` del advisory lock. Se corrigió con cast a text; la corrida corregida inicial pasó 31/31. Se ampliaron casos de formularios/redacción/control humano posteriormente. La primera suite completa aprobó 1292 pruebas y detectó únicamente traducciones faltantes para los errores nuevos; se añadieron al catálogo existente. La corrida focal final aprobó los 39 casos, incluido el verificador de traducciones. Otra corrida completa por TCP obtuvo 1292/1294: un timeout de 15 s en POS/Lealtad y una conexión PostgreSQL fallida en Admin/Clientes. El contenedor seguía sano, sin OOM ni reinicios. Se repitió todo con socket Unix en una base vacía, un worker, timeout de test de 60 s y hook de 30 s; no se modificaron POS, Lealtad ni Admin para resolver infraestructura. No se relajaron permisos ni se agregaron dependencias para resolverlo.

No se midieron volúmenes productivos, locks durante migración en una copia de producción, proveedor real, n8n real, entrega externa, costos conciliados ni inventario del VPS. CI utiliza Node22 y sigue pendiente fuera de este entorno Node24.

## 8. Validación reproducible y preparación de un piloto futuro

1. Revisar diff desde `4ddb482` y SQL. No cambiar URLs/secretos/conectores ni instalar cron por seguir este documento.
2. Crear una **base desechable vacía**, definir `PHASE1_TEST_DATABASE_URL` y aplicar ahí migraciones existentes más la expansión. No usar la BD habitual ni una URL productiva.
3. Ejecutar:

```bash
DATABASE_URL="$PHASE1_TEST_DATABASE_URL" npx prisma validate
DATABASE_URL="$PHASE1_TEST_DATABASE_URL" npx prisma generate
DATABASE_URL="$PHASE1_TEST_DATABASE_URL" npx prisma migrate deploy
TEST_DATABASE_URL="$PHASE1_TEST_DATABASE_URL" DATABASE_URL="$PHASE1_TEST_DATABASE_URL" \
  env -u AI_PROVIDER -u AI_DRAFT_PROVIDER -u N8N_BASE_URL npm test -- --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000
npm run lint
npx tsc --noEmit --incremental false
DATABASE_URL="$PHASE1_TEST_DATABASE_URL" npm run build
```

4. En fixture propio y autenticado como gestor: dry-run → revisar hash/cantidades → aplicar con ese hash → comparar texto, modos, derechos y counts. Repetir apply y verificar una instancia/revisión. No invocar acciones contra clientes reales durante esta validación.
5. Si posteriormente se autoriza staging: snapshot/respaldo/restauración nuevos, inventario por organización protegido sin secretos, ensayo de carga y verificación del commit desplegado. Ningún tenant piloto se eligió en esta fase.
6. Solo después de migrar en entorno autorizado, habilitar flag global; luego habilitar observación de un tenant revisado. Confirmar que genera raíces/steps sin llamadas adicionales, sin efectos CRM nuevos ni ledger duplicado. La UI nueva y la activación de especialistas requieren sus fases correspondientes.

## 9. Rollback y riesgos residuales

Rollback por tenant: apagar observación con hash actual; no modificar modos de canales, permisos ni planes. Conservar raíces/revisiones. Los workers de Fase 0 continúan siendo autoridad; completar/conciliar sus envíos ambiguos bajo el runbook de [12](12_IMPLEMENTACION_FASE_0.md#9-rollback).

Rollback global: `AI_AGENT_MODEL_ENABLED=false` evita nuevas dependencias de las tablas. Las trazas pendientes pueden quedar sin actualizar hasta reactivar solo el observador; los trabajos de Fase 0 siguen durables. Volver al código de Fase 0 es compatible con la expansión: no ejecutar down/drop, no restaurar una BD vieja encima de datos nuevos. El schema/IDs/historial nuevos se conservan para revisar o reanudar. Mantener las correcciones de permisos de Fase 0.

Riesgos:

- La observación requiere disponibilidad de BD y cron; puede quedar retrasada y no representa SLA de delivery externo.
- Snapshot de admisión no equivale al prompt efectivo; el runtime legacy todavía puede leer cambios posteriores. No usar esta traza para certificar reproducción exacta o facturar por especialista.
- Inventariar/hash de todas las fuentes por tenant tiene costo proporcional a su volumen. Medir antes de habilitar shadow en cuentas grandes; no se ha declarado aptitud de carga productiva.
- El bloqueo por organización serializa backfill y observación. Medir contención, tiempos y lotes en staging; la configuración global debe permanecer apagada hasta entonces.
- Revisiones privadas de identidad/Rulebook necesitan la misma protección/retención que esas fuentes; no se expusieron en la traza. La inmutabilidad es del servicio, no un bloqueo contra un administrador SQL.
- Mapeos ambiguos o definiciones incompatibles fallan cerrados; si shadow ya estaba activo pueden impedir admisión hasta revisar o apagar observación. Nunca se autocorrigen borrando/reasignando datos.
- Persisten los pendientes de costo, atomicidad CRM, cuentas del mismo canal y validación externa documentados en Fase 0. Esta base no los declara resueltos por existir tablas nuevas.

## 10. Próxima etapa

La siguiente fase del roadmap es **Fase 2: interfaz sobre el adapter**, no Mark ni Alex. Antes de integrarla/desplegar: revisar cambios, CI Node22 y riesgos de retención/carga; para un cutover operativo también inventario real, respaldo reciente y staging autorizado. No se empezó Fase 2 ni se activó producción. La decisión comercial de instancias y el piloto siguen pendientes; no bloquean mantener el modelo apagado y el comportamiento legacy intacto.

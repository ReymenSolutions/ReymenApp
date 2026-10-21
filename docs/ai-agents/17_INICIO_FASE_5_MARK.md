# 17 — Inicio de Fase 5: núcleo de Mark y arnés de simulación

Fecha: 21 de octubre de 2026. Rama: `codex/ai-center-phase5-mark-sandbox`. Base: `29e0c9f`, cierre local de Fase 4. Autorización: «inicia», después del reporte de Fase 4.

## 1. Resultado y límites del inicio autorizado

Se inició Fase 5 con el núcleo acotado de protocolo de Mark y el arnés mínimo AG-013 que el roadmap exige antes de AG-011. **No se declara completo el MVP productivo de Mark.** Faltan el piloto real de Fase 3, la evaluación de respuestas/proveedor y los controles de costo/atribución mínimos de Fase 8. El propietario había pedido continuar con lo independiente y posponer la elección del canal; no se volvió a bloquear el trabajo por esa decisión.

Commits locales separados: `3b3c499` (núcleo/recibos), `c7a09e8` (pantalla/pruebas) y `3dee3f1` (selectores de regresión). No se hizo push, merge ni despliegue.

La implementación usa un driver determinista y datos ficticios versionados: no invoca un LLM, no consulta CRM/conocimiento real, no tiene herramientas de escritura/envío y no crea ni activa una instancia de Mark. Las respuestas son ejemplos de protocolo, no evidencia de calidad de un modelo. No se conectó el motor a webhooks, Conversation, rutas de canal o emisor. Las pruebas no modifican producción ni bases reales.

## 2. Evidencia revisada y discrepancias

Se revisaron roadmap 07, AG-011/AG-013 en 11, gobierno 06, QA 08 y cierre 16, además del gateway/ledger, observador de ejecuciones, probador, modelos de sandbox y cron actuales.

El roadmap enumera Fase 5 después de Fase 4, pero requiere dependencias de 3 y 8 y un arnés previo. No sería correcto activar respuestas reales solo por haber llegado a ese número de fase. Se implementó lo independiente como inicio verificable, conservando esos gates.

`AgentExecution` representa al worker legacy y exige referencia a su job/revisión; reutilizarlo aquí fingiría una conversación/ejecución real. `AiSandboxSession/Message` representa sesiones de prompts con texto/contexto; no tiene claim, cancelación, lease ni recibo idempotente. Se añadió una tabla pequeña de ejecuciones de prueba, sin modificar esos historiales ni PromptVersion. No se añadió broker, Redis, microservicio o dependencia.

## 3. Archivos y cambios

- [Contrato](../../src/lib/ai/mark/contract.ts): Mark/protocolo v1, fixture `mark-fixtures-v1`, schemas estrictos y límites.
- [Motor](../../src/lib/ai/mark/engine.ts): una decisión terminal, herramientas de lectura en allowlist, permisos por prueba, plazo, cancelación y traza mínima. No importa ORM, proveedor, emisor, filesystem ni funciones de escritura.
- [Fixtures/driver](../../src/lib/ai/mark/fixtures.ts): horario, matcha de $95 y cliente ficticio con dos visitas/$150. Datos de ejemplo en español, sin relación con clientes reales. El driver simula el protocolo con reglas deterministas, no comprensión de lenguaje de un LLM.
- [Servicio durable](../../src/lib/ai/mark/service.ts): admisión, hash de argumentos/versiones, claim único, estado/cancelación, lectura propia y caducidad.
- [Acciones](../../src/actions/mark-sandbox.ts): sesión/rol/módulo y entradas estrictas. No aceptan tenant, actor, proveedor, callbacks, SQL ni modo live.
- [Esquema](../../prisma/schema.prisma) y [migración](../../prisma/migrations/20261116095000_mark_sandbox_runs/migration.sql): `AgentSandboxRun`, FK a organización, índice de expiración y clave única organización/actor/requestKey.
- [Pantalla](../../src/components/portal/ai-center/MarkSandbox.tsx) en [Probar](../../src/app/(portal)/portal/ai-lab/page.tsx): simulación explícita, consultas permitidas, detener/limpiar, recuperar resultado, pasos y errores ES/EN. No cambia navegación ni sustituye al probador existente.
- [Cron existente](../../src/app/api/cron/retry-webhooks/route.ts): reconcilia hasta 50 pruebas vencidas por pasada cuando está habilitado. No cambia el contrato de respuesta ni reintenta Mark.
- [Traducciones](../../src/lib/server-messages.ts), [.env.example](../../.env.example), [helpers de limpieza sintética](../../src/test/helpers.ts), pruebas y seguimiento de auditoría.
- Regresión de [conocimiento](../../e2e/knowledge-access.spec.ts) y [rulebook](../../e2e/rulebook.spec.ts): selectores acotados a `main` y espera compatible con ambos títulos, excluyendo fragmentos SSR ocultos del servidor.

## 4. Seguridad, límites y recuperación

`AI_MARK_SANDBOX_ENABLED=false` por defecto. Habilitarlo permite únicamente este sandbox; no habilita una ruta real o un agente facturable. La base requiere la migración aditiva antes de habilitarlo. Con el flag apagado, página/cron no consultan la tabla nueva y las acciones se rechazan; el runtime anterior continúa.

La sesión fija organización y actor. Se exige `knowledge_base:manage` y `AI_WHATSAPP`. El servicio comprueba en BD usuario/rol/organización/módulo activos al admitir y en cada frontera, además del estado de la ejecución. Cada actor solo lee/cancela sus pruebas, incluso dentro del mismo negocio. No hay credenciales del operador en los adaptadores.

Solo existen `knowledge.search` y `customer.summary`, ambas sobre fixtures. Los permisos son un snapshot de la prueba, no grants de herramientas reales de Mark. Todo el lote de herramientas se valida antes de leer; una petición mezclada con una consulta denegada no ejecuta la parte permitida. Parámetros extra como tenant/customerId, herramientas desconocidas, modo live o un proveedor elegido por el navegador se rechazan.

Límites: 4 pasos, 2 decisiones simuladas, 2 lecturas, 1 derivación terminal y 5 segundos de motor; salida de decisión hasta 8000 caracteres, respuesta hasta 800 y datos de herramienta hasta 4000 serializados. Un plazo vencido aborta la señal e ignora resultados tardíos. No se promete matar código arbitrario dentro del proceso: no se admite código del usuario, y los adaptadores ejecutables son dependencias internas controladas.

La admisión fija hash de entrada y versiones. Una misma requestKey devuelve el recibo existente; modificar argumentos con esa key falla. Un actor no puede tener dos pruebas pendientes y tiene un límite de 10 admisiones por minuto. El claim QUEUED→RUNNING es atómico: una petición repetida no reinicia la decisión ni hace retry. El resultado solo se confirma si sigue RUNNING y vigente; cancelar impide una confirmación tardía.

El lease es de 60 segundos desde la admisión, distinto del límite de 5 segundos del motor. Un proceso interrumpido no se relanza automáticamente: lectura o cron lo convierte en FAILED al vencer. Un fallo de BD puede posponer persistencia hasta recuperar la BD, pero no existe trabajo de envío/CRM que repetir. La interfaz conserva el ID admitido para consultar el resultado ante un error de transporte. Reset/unmount ignoran respuestas de otra generación; reset solicita cancelación sin borrar el recibo. La cancelación no garantiza abortar trabajo ya completado o una petición que la cola del cliente todavía no haya enviado; no hay efectos externos en este modo.

## 5. Datos, trazas y costos

Se guardan IDs de organización/actor, key de idempotencia, hash de entrada, versiones, fechas, estado y pasos acotados. Se conserva la respuesta ficticia final. No se persiste el texto ingresado en la tabla o auditoría de este flujo. Un hash no es anonimización; acordar retención antes de incorporar datos reales. No se añade limpieza automática de recibos.

La traza registra tipo de paso, herramienta permitida, IDs de fuente ficticia y códigos de error cerrados. No incluye prompts ni excepciones del proveedor/SQL. Errores desconocidos de transporte se muestran con un mensaje genérico; los UserError conocidos se traducen.

`providerCalls=0` y `externalEffects=0` describen este modo de simulación. **No son costos reales medidos ni un precio comercial.** No se escribe AiUsage porque no hay llamada a un proveedor, no se duplica el ledger. El prototipo no sustituye las reservas, ledger y evaluación de presupuesto de Fase 8 necesarias para usar un modelo real.

## 6. Evidencia de validación

| Comprobación | Resultado local |
| --- | --- |
| Migración desde BD vacía y comparación Prisma | 82 migraciones aplicadas; diff vacío |
| Suite completa | 201 archivos / 1418 pruebas aprobadas; 453.95 segundos |
| TypeScript | `npx tsc --noEmit`, sin errores |
| ESLint | 0 errores; 51 advertencias existentes en el repositorio. Archivos nuevos y pruebas ajustadas sin advertencias |
| Build de producción local | `npm run build`, correcto |
| Documentación y diff | 327 referencias locales válidas; `git diff --check` correcto |
| Mark en Chromium | 3 casos: permisos/datos ficticios, fallo de transporte y responsive/ES/EN/rol |
| Regresión del centro, canales, conocimiento, Inbox, envío manual, cron y reglas | 20 casos aprobados entre ejecución inicial y repetición focal de 3 casos |
| Rollback independiente de Mark, conocimiento y conexiones | 3 casos aprobados |
| Rollback completo de UI/modelo y rulebook legacy | 2 casos aprobados |

Se añadieron 52 pruebas de unidad/integración/interacción al baseline de 1366. En total se validaron 28 casos distintos de navegador entre los escenarios habilitado y de rollback.

Cobertura nueva: [motor](../../src/lib/ai/mark/engine.test.ts), [servicio/acciones con PostgreSQL](../../src/lib/ai/mark/service.test.ts), [interacción](../../src/components/portal/ai-center/MarkSandbox.test.tsx), [navegador](../../e2e/mark-sandbox.spec.ts) y [rollback](../../e2e/mark-sandbox-rollback.spec.ts). Incluye concurrencia real de admisión/claim, cancelación mientras una decisión está suspendida, revocación de acceso, tenant/actor ajenos, esquemas maliciosos, límite de pasos/tiempo, señales abortadas, recibos y ausencia de escrituras comerciales.

Durante la regresión inicial hubo 17/20 aprobados. Las trazas mostraron selectores de conocimiento/rulebook que también coincidían con fragmentos SSR ocultos (`div[hidden]#S:1`) fuera de `main`; se acotaron a `main` sin usar `.first()` ni omitir aserciones. Los tres casos afectados pasaron después. Un fallo inicial de actualización del modo de publicación no se reprodujo en dos ejecuciones focales; no se atribuye una causa ni se declara corregido. La primera prueba de rulebook en modo legacy también reveló que la espera recién añadida usaba el título del centro nuevo; se ajustó para reconocer ambos títulos y pasó. Estos ajustes son de pruebas, no cambios en fuentes/reglas del negocio.

El navegador detectó que se podía escribir en el textarea nuevo antes de hidratar y concatenar la pregunta inicial. Se deshabilitaron los controles de Mark hasta tener el snapshot del cliente; los tres casos de Mark pasaron con esa corrección.

Comandos reproducibles (usar exclusivamente una BD local desechable y las variables de prueba indicadas por cada spec):

```sh
npx prisma migrate deploy
npx prisma migrate diff --from-url "$TEST_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
npm test -- --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000
npx tsc --noEmit
npm run lint
npm run build
```

Para E2E, iniciar el build en localhost con las credenciales de fixture y flags según el escenario; ejecutar Playwright con `--workers=1`. Los casos de rollback requieren reiniciar el servidor con los flags correspondientes apagados y definir `E2E_MARK_ROLLBACK`, `E2E_KNOWLEDGE_ROLLBACK`, `E2E_CHANNEL_ROLLBACK` o `E2E_AI_UI_ROLLBACK=true`. No ejecutar build mientras ese servidor sirve el mismo `.next`.

Las pruebas usan bases vacías sintéticas locales, adaptadores ficticios y Chromium. No se valida un proveedor, conexión de canal ni dispositivo iOS físico. Los procesos de servidor y PostgreSQL iniciados para pruebas se detuvieron al terminar; se conservaron las bases sintéticas. El corpus golden verifica el protocolo determinista, no la calidad de respuestas de una IA.

## 7. Pendientes y riesgos residuales

- Seleccionar canal/tenant piloto y verificar conector sandbox, propiedad de cuenta, permisos, entrega y fallos ambiguos de Fase 3.
- Implementar/validar atribución por instancia/raíz y presupuesto dedicado para pruebas reales; conservar el ledger único. No se completó Fase 8.
- Autorizar y registrar una instancia real de Mark con grants persistentes. Enlazar fuentes de Fase 4 y lecturas mínimas del cliente derivado de una conversación autorizada. No permitir IDs de clientes elegidos por el modelo.
- Integrar el protocolo con un proveedor por el gateway existente, evaluar respuestas/costos y tratar explícitamente llamadas inciertas/fallback antes de permitir inferencia real. No conectar un driver real a este sandbox y seguir anunciando consumo cero.
- Integrar turno, control humano, rutas, deduplicación y outbox de Fase 0/3 para una respuesta real. No crear un segundo emisor.
- Validar concurrencia, revocaciones y prompt injection con fuentes reales autorizadas. La validación de esquema y referencias no demuestra veracidad de una respuesta de modelo.
- La traza nueva no es un registro de conversación real ni prueba de entrega. Definir retención y exportación por rol antes de producción.
- Vigilar la actualización de la política de conocimiento en el piloto: hubo un fallo transitorio inicial de navegador y dos repeticiones correctas; no se comprobó una causa.
- No se realizó CI remoto Node 22, carga productiva ni despliegue.

## 8. Compatibilidad y validación manual

El probador anterior, reglas, fuentes, Inbox, ledger y canales conservan su comportamiento. El nuevo panel es independiente y oculto por defecto; no crea un especialista en My Agents ni modifica planes/cupos. Los estados de `AgentSandboxRun` no alteran Conversation ni AgentExecution legacy. No se ejecutaron migraciones reales, ni se cambiaron POS/Lealtad/compras.

1. Crear una BD local desechable, aplicar las 82 migraciones y generar Prisma. Configurar exclusivamente credenciales de fixture.
2. Con el flag apagado, validar el probador anterior y que no se consulten/creen pruebas nuevas.
3. En localhost, habilitar el flag y entrar como OWNER/MANAGER en Probar. Comprobar el aviso de datos ficticios y consumo simulado.
4. Probar horario/precio, visitas con permiso desactivado y activado, pregunta desconocida y pedido de ayuda humana. No debe aparecer un mensaje en Inbox, un cliente, una instancia ni consumo de proveedor.
5. Detener/limpiar, simular una respuesta tardía/error de transporte, consultar recibo y verificar que no se reinicie la ejecución. Comprobar estados vencidos en lectura/cron y las vistas 320/390/768/1280, ES/EN, dark/teclado.
6. Ejecutar pruebas, TypeScript, lint y build; usar las pruebas negativas y de regresión del reporte antes de abrir un piloto.

## 9. Rollback

Apagar `AI_MARK_SANDBOX_ENABLED` oculta el panel, bloquea nuevas acciones y evita consultas de conciliación de Mark en cron. No activa ningún modo de canal. Conservar tabla, recibos y auditoría; no hacer down/drop ni restaurar una BD antigua. Las ejecuciones pendientes no se reenvían; al volver a habilitar, lectura/cron concilia las vencidas como fallidas. No hay mensajes ni cambios comerciales de este modo que revertir.

Los flags de conocimiento/conexiones/modelo/UI mantienen sus procedimientos independientes. El rollback del lector de conocimiento conserva su advertencia de artículos activos sin grants; esta fase no lo modifica.

## 10. Recomendación

Continuar con los gates pendientes de Fase 3 y el mínimo de Fase 8, sin activar Mark en conversaciones. Este inicio proporciona un arnés ejecutable para evaluar las siguientes integraciones. No iniciar Alex, delegación, marketplace ni cambios de producción como consecuencia de este prototipo.

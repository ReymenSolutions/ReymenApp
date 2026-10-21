# 08 — QA, pruebas ejecutadas y regresión

## Evidencia ejecutada — P

Fecha 2026-10-20, commit local `6fd1ef66ee7ec3a41bb38bfdb890df76ed217042`. Se ejecutó un arnés Node por stdin: lee TypeScript, transpila en memoria con TypeScript instalado y evalúa funciones mediante `vm.runInNewContext`. Require solo acepta mocks explícitos, crypto y zod; import desconocido falla. Prisma/auth/Next/proveedor/n8n se sustituyen por objetos en memoria. process.env de sandbox solo contiene NODE_ENV=production. No se ejecutó Vitest, se abrió BD ni se hicieron llamadas de red. No se crearon archivos de implementación/test.

Resultado real: **18 checks passed; DB/network writes=0; all persistence mocks in memory.** Duración reportada por comando: 0.77s. Esta evidencia no certifica navegador, BD real, performance o producción.

| Check | Caso ejecutado | Resultado observado |
|---|---|---|
| P01 | can OWNER/MANAGER knowledge_base:manage | true para ambos |
| P02 | can AGENT/VIEWER/CLIENT knowledge_base:manage | false para los tres |
| P03 | conversations:reply AGENT/VIEWER | true/false |
| P04 | normalizar contact_form | enquiry |
| P05 | alias IG/website_chat | instagram/webchat |
| P06 | salida WhatsApp/email | whatsapp-outbound/email-outbound |
| P07 | HMAC válido con timestamp fresco | autorizado |
| P08 | Mismo HMAC, cuerpo alterado | rechazado |
| P09 | Firma válida con timestamp de hace 6min | rechazado |
| P10 | Secreto plano en production | rechazado |
| P11 | Rulebook voice 5000 caracteres | truncado a 4000 |
| P12 | Nueve artículos en renderRulebookPrompt | octavo incluido, noveno excluido |
| P13 | Artículo de 1200 chars + marcador | marcador final excluido |
| P14 | createArticle con sesión VIEWER mock | Llega a create; org forzada de sesión: reproduce H01 |
| P15 | updateArticle/deleteArticle con VIEWER mock | Llegan a persistencia simulada: reproduce H01 |
| P16 | upsertWhatsAppAssistant con VIEWER/módulo activo mock | Llega a upsert: reproduce H01 |
| P17 | runAutoReply: proveedor lanza error genérico | skipped, draft GENERATING, cero conversation.update: reproduce H02 |
| P18 | unsafeReason con URL y parseDecision JSON inválido | contains_link / escalate |

Los checks que reproducen defectos pasan porque el resultado esperado era **confirmar el defecto**, no porque el sistema sea correcto.

### Reproducción mínima de H01 sin BD

Bloque documental, no archivo ejecutable añadido al producto. Ejecutar desde raíz de ReymenApp con Node y dependencias ya instaladas. Solo escribe en memoria.

```javascript
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const canModule = {};
const compile = (path) => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
vm.runInNewContext(compile('src/lib/permissions.ts'), { exports: canModule });
assert.equal(canModule.can('VIEWER', 'knowledge_base:manage'), false);
const writes = [];
const mocks = {
  'next/cache': { revalidatePath() {} },
  '@/lib/auth': { auth: async () => ({ user: {
    id: 'fixture-user', organizationId: 'fixture-org', role: 'VIEWER'
  } }) },
  '@/lib/user-error': { UserError: Error },
  '@/lib/prisma': { prisma: { knowledgeBase: {
    create: async (args) => writes.push(args)
  } } },
  zod: require('zod')
};
const action = {};
vm.runInNewContext(compile('src/actions/knowledge-base.ts'), {
  exports: action,
  require: (id) => {
    if (!Object.hasOwn(mocks, id)) throw Error('Unexpected import: ' + id);
    return mocks[id];
  }
});
(async () => {
  await action.createArticle({ title: 'Fixture', content: 'Audit' });
  assert.equal(writes.length, 1); // confirma la omisión de guardia actual
  assert.equal(writes[0].data.organizationId, 'fixture-org');
  console.log('H01 reproducido en memoria, sin BD');
})().catch((error) => { console.error(error); process.exitCode = 1; });
```

Para P17 se mockeó Conversation OPEN, canal AUTO, último Message USER, cero respuestas horarias; ReplyDraft.create fijó GENERATING y generateText lanzó Error('Simulated provider failure'). Assert verificó retorno skipped, estado unchanged y cero actualizaciones de conversación. HMAC usó secreto fixture inventado, no credencial real. Fuentes: [permissions](../../src/lib/permissions.ts), [KB actions](../../src/actions/knowledge-base.ts), [auto reply](../../src/lib/ai-auto-reply.ts).

## Pruebas existentes inspeccionadas — C, no ejecutadas

| Suite | Cobertura que declara el código | Gaps a añadir |
|---|---|---|
| `src/actions/knowledge-base.test.ts` | Mass assignment organizationId | Roles, módulo, borrado/edición, tamaño y tags |
| `src/lib/ai-auto-reply.test.ts` | Respuesta/dedup/guardrails/humano/límite/proveedor | Terminal FAILED/escala real, caída posrespuesta, carreras de takeover/disable |
| `src/lib/ai-draft.test.ts` | Borradores, permisos de tenant/estado | Force concurrente, reserva/retry y humano |
| `src/lib/ai-pipeline.test.ts` | Análisis/plan/acciones | Consentimiento/política por instancia, atomicidad y conflicto de turno |
| `src/lib/ai/gateway.test.ts` | Tokens/costo/tarifa/dedup/fallo/OpenAI mock | Conciliación modelo efectivo y costo desconocido, fallo BD posproveedor |
| `src/lib/ai/budget.test.ts`, `src/lib/ai-budget-agents.test.ts` | Budget/DEGRADE/pausa | Concurrencia prolongada/TTL/reconciliación, snapshot de ciclo |
| `src/lib/agent-cap.test.ts` | Cupos, override, legacy/nuevas org | Dos activaciones con una plaza |
| `src/lib/channels.test.ts` | Normalización y agrupación | Aislamiento de hilo/cuenta, destinos externos |
| `src/lib/webhook-hardening.test.ts`, `webhook-ingest.test.ts`, `webhook-retry.test.ts` | HMAC/replay/dedup/claim/retry | IDs obligatorios y límites por conexión, status monotónico, programación IA en retry |
| `src/components/portal/RulebookEditor.test.tsx` | Edición y estado local | AUTO copy, ES/EN/a11y/unsaved SPA |
| `src/lib/ai/portal-usage.test.ts`, `report.test.ts` | Uso/agrupación/DTO | Modelos/agentes nuevos, ciclos históricos, unknown y retail |

`vitest.setup.ts` asigna DATABASE_URL a test y helpers crean/eliminan fixtures. Por la prohibición actual de modificar BD, no se ejecutaron npm test/e2e, migrations/seed, build que requiera DB, ni llamadas a probador real. No se instalaron paquetes ni se consultó proveedor/SCA externo. [setup](../../vitest.setup.ts), [helpers](../../src/test/helpers.ts).

## Plan de prueba futuro — I

### Aislamiento del entorno

BD desechable con dos organizaciones A/B y roles reales; datos sintéticos, sin dumps PII salvo autorización específica. Network deny por defecto, proveedor fake, conectores que solo registran en memoria o servidor local. Namespace de Execution de prueba y guardia backend que rechaza tool write/envío en modo simulación. CI verifica nombre/URL de BD antes de limpiar fixtures; no usar credenciales de producción. Pruebas contractuales de proveedor real solo sandbox y presupuesto explícito.

### Matriz de aceptación

| ID | Prioridad / escenario | Aserción de salida |
|---|---|---|
| QA01 | P0: roles OWNER/MANAGER/AGENT/VIEWER/CLIENT/ADMIN/anónimo | Acceso UI y directo coherente; acción denegada no escribe, no consume IA ni envía |
| QA02 | P0: IDs de tenant B desde sesión A en todas las acciones | 404/denegado sin filtrar existencia/contenido; sin lectura cruzada |
| QA03 | P0: HMAC ausente, cuerpo cambiado, timestamp viejo/futuro, replay | Rechazo/dedup según contrato; requests frescos requieren event ID estable |
| QA04 | P0: mismo contacto en WA/email/dos cuentas y escalado | Hilos/destinos correctos, identidad CRM compartida si corresponde; humano respetado |
| QA05 | P0: humano responde/apaga/suspende durante LLM | No salida automática posterior obsoleta; handoff registrado |
| QA06 | P0: crash antes/después inferencia y antes/después envío | Claim recuperable; una escritura/envío; estado ambiguo conciliado |
| QA07 | P0: error proveedor/JSON inválido/guardrail | Terminal legible y derivación; ninguna promesa de respuesta entregada |
| QA08 | P0: timeout de tool write/callback doble | Misma key devuelve resultado previo o consulta estado; nunca segundo efecto |
| QA09 | P0: fuente/usuario/tool output pide ignorar permisos/exfiltrar | No tenant/tool nuevo, no acceso a secreto, no URL arbitraria |
| QA10 | P0: 20 llamadas concurrentes con budget pequeño | Reserva serializada, hard cap configurado, desconocido no gratuito; registrar todos los intentos |
| QA11 | P0: fallback modelServed distinto, tarifas/FX cambiantes | Estimado/confirmado/desconocido distinguibles; snapshots coherentes |
| QA12 | P0: cap 1 plaza, dos activaciones/solicitudes | Una admisión y una solicitud; conflicto legible |
| QA13 | P0: approval viejo/argumentos cambiados/revocación | No ejecuta; nueva aprobación ligada a propuesta/hash/actor |
| QA14 | P1: 9+ artículos, precio al final, revisión revocada | Retrieval explicable, pérdida por truncado visible, ningún texto sin grant |
| QA15 | P1: reset/cambio de agente durante prueba | Respuesta antigua no aparece en nueva sesión; sin doble request |
| QA16 | P1: single/channel/workflow Playground | Misma lógica de policy, tools simuladas, costo mostrado, fixture/version/trace guardados separadamente |
| QA17 | P1: 2 agentes, 3 calls, 1 conversación | 3 llamadas/costos sumados; conversación total=1, no suma de subtotales por agente |
| QA18 | P1: cambio de plan/ciclo/reset/topup | Historial anterior no reinterpretado, ajustes inmutables, retail separado |
| QA19 | P1: móvil/ES/EN/dark/zoom/teclado/lector | Sin overflow global ni flash; controles con nombre/foco, cuatro estados |
| QA20 | P1: n1–9 métricas, breakpoints 1/2/3/4 columnas | Última solitaria ocupa fila, otras distribuciones conservan composición |
| QA21 | P0: coexistencia código viejo/nuevo y backfill repetido | Cero pérdida/hash mismatch, IDs preservados, solo runtime autoritativo |
| QA22 | P0: desactivar flag durante tareas pendientes | Conciliar y drenar; sin ventas/conversaciones duplicadas ni pérdida de nuevo dato |
| QA23 | P1: entrada Email autoresponder/Enquiry sin destino | No loop ni envío sin destino permitido; estado de atención explícito |
| QA24 | P1: callbacks READ→SENT, duplicados y expiración token | Estado monotónico y reconexión accionable, sin repetir entrega |
| QA25 | P0: regresión CRM/POS/Loyalty/automations | Venta y visita no dependen de IA, cancelación/idempotencia intactas; contactos/consentimiento no se duplican |

### Rendimiento y observabilidad

Medir baseline antes de fijar SLA: p50/p95 de admisión, cola, inferencia y delivery por canal; CPU/memoria, consultas/locks, reintentos, tasa de derivación/error, costo por conversación útil. Carga sintética propuesta: 10/50/100 eventos concurrentes repartidos en tenants con duplicados/latencia. No ejecutar contra VPS ahora.

Criterios propuestos: admisión persiste y responde antes de inferencia; cola sin starvation entre tenants; cero ejecución cruzada/duplicada; cada accepted event tiene raíz rastreable y estado terminal o espera humana visible. Presupuesto y timeout prevalecen sobre objetivo de latencia. Umbrales absolutos se acuerdan tras baseline; no inventar p95 actual.

### Evaluación de calidad

Corpus ES/EN versionado por tenant sintético: horario/precio cubierto, pregunta no cubierta, reclamo/reembolso/humano, datos contradictorios, nueva intención comercial, solicitud de cita y ataque de inyección. Evaluación humana contra rúbrica (exactitud/citas/handoff/consentimiento), no solo string exacto ni modelo-juez único. No regresión en casos críticos; medir utilidad de Alex antes de aumentar agentes.

### Gates de salida

Ninguna fuga tenant/rol, doble efecto, envío no aprobado o pérdida de datos aceptable. Todos P0 pasan en entorno aislado; revisión de código y contrato con conector real del piloto; backup/restauración y rollback ensayados; alertas en operación; owner revisa copy/efectos/planes. Solo entonces proponer despliegue concreto y autorización específica. Esta auditoría no satisface todavía esos gates de producción.

## Verificación documental de esta entrega — P

Se verificaron los 12 Markdown, 226 enlaces locales (destino existente y líneas dentro del archivo), delimitadores de bloques de código y ausencia de marcadores de plantilla/espacios finales. El ejemplo documental de H01 se volvió a ejecutar sin BD y reprodujo el resultado descrito. `git status --short` mostró únicamente `?? docs/ai-agents/`; no cambios funcionales rastreados. No se validó el renderizador Mermaid en navegador; los diagramas son especificaciones textuales.

## Evidencia posterior: implementación Fase 0

Las 18 comprobaciones de auditoría anteriores son históricas y reprodujeron defectos; no representan el resultado del código corregido. Las nuevas suites PostgreSQL, carreras, reintentos, aislamiento y Chromium, junto con resultados reales y limitaciones, están en [12 — evidencia](12_IMPLEMENTACION_FASE_0.md#4-evidencia-de-pruebas). Las pruebas solo utilizan bases desechables independientes de producción.

## Evidencia posterior de Fase 1

La matriz old/new schema/código, backfill, CAS, scopes y observación sin duplicar efectos está en [13](13_IMPLEMENTACION_FASE_1.md#7-evidencia-de-validación). Solo se usaron bases sintéticas. El resultado de Fase 0 se conserva como evidencia histórica, no sustituye esta regresión.

## Evidencia posterior de Fase 2

La evidencia final de consultas por organización, permisos, interacciones, paginación, cuatro estados y Chromium se registra en [14](14_IMPLEMENTACION_FASE_2.md#5-evidencia-de-pruebas). Se usan dos bases sintéticas separadas y proveedores deshabilitados/simulados. QA19/20 cuentan con cobertura automatizada de viewport/temas/teclado/zoom y grids; los dispositivos físicos, lector de pantalla y CI Node22 conservan sus pendientes. No equivale a gates productivos cumplidos.

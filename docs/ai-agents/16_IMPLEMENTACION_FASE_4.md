# 16 — Fase 4: acceso al conocimiento por asistente

Fecha: 21 de octubre de 2026. Rama: `codex/ai-center-phase4-knowledge`. Base: `b7831a6`, cierre local de Fase 3. Commits revisables: `1ffdbc3` (modelo, permisos, consulta y runtime) y `7269d7f` (interfaz y regresión del editor).

Se continúa exclusivamente con la siguiente fase del roadmap, AG-010/H07. El piloto de canales sigue aplazado por el propietario. Esta fase depende del modelo de Fase 1 y puede validarse localmente sin elegir un canal ni tocar conexiones. No se inició Fase 5.

## 1. Hallazgos corregidos y diferencias con la auditoría

El lector anterior seleccionaba los ocho artículos activos más recientes y recortaba cada contenido a 1200 caracteres desde el principio. No había permisos por instancia, publicación ni revisiones de documentos. H07 describía correctamente esos límites; la pérdida de etiquetas omitidas ya estaba corregida en Fase 0. Los permisos de escritura H01 ya estaban protegidos y se conservaron.

Se añade una única fuente `KnowledgeBase` con revisiones de contenido y múltiples asignaciones a versiones publicadas. Las copias históricas son revisiones necesarias para reproducibilidad, no artículos duplicados por asistente. Editar crea un borrador; no sustituye la versión que consulta el asistente. Publicar tampoco asigna automáticamente. Una fuente sin asignación no entra al nuevo lector.

Retirar un artículo ahora lo desactiva: conserva ID, contenido, revisiones y asignaciones, excluyéndolo de las consultas. Puede reactivarse explícitamente; no vuelve a habilitar asignaciones revocadas. No se ejecutó ninguna eliminación sobre datos reales.

## 2. Archivos modificados

- [Esquema](../../prisma/schema.prisma) y [migración aditiva](../../prisma/migrations/20261116094000_knowledge_access_phase4/migration.sql): versión de artículo, revisiones, asignaciones y política por negocio; FKs compuestas por organización y checks de versiones.
- [Servicio](../../src/lib/ai/knowledge/service.ts): revisión, publicación, asignación/revocación, reactivación y política; bloqueo por organización, CAS y auditoría sin contenido.
- [Retrieval](../../src/lib/ai/knowledge/retrieval.ts): selección léxica acotada, fragmentos relevantes, límites y revalidación de versión; [lector de configuración](../../src/lib/ai/knowledge/data.ts).
- [Acciones de acceso](../../src/actions/knowledge-access.ts) y [artículos](../../src/actions/knowledge-base.ts): sesión, rol, módulo, organización activa y entradas limitadas; tags omitidos se preservan.
- [Rulebook](../../src/lib/rulebook.ts), [borradores](../../src/lib/ai-draft.ts), [respuesta automática](../../src/lib/ai-auto-reply.ts) y [pipeline](../../src/lib/ai-pipeline.ts): consulta por pregunta y versión de autorización, conservando el único runtime/emisor.
- [API v1](../../src/app/api/v1/knowledge-base/route.ts): conserva lector anterior fuera del opt-in; dentro solo entrega fragmentos publicados/asignados al asistente existente derivado en backend.
- [Pantalla](../../src/components/portal/ai-center/Knowledge.tsx), [controles](../../src/components/portal/ai-center/KnowledgeAccess.tsx), [editor](../../src/components/portal/ArticleDialog.tsx) y [desactivación](../../src/components/portal/DeleteArticleButton.tsx): revisión, publicación, versiones, asignación, prueba y recuperación; ES/EN, controles táctiles, foco del diálogo y sin cambios de navegación.
- [Pruebas de fuentes](../../src/lib/ai/knowledge/knowledge.test.ts), [runtime](../../src/lib/ai/knowledge/runtime.test.ts), [editor concurrente](../../src/components/portal/ArticleDialog.test.tsx), [navegador](../../e2e/knowledge-access.spec.ts), [rollback](../../e2e/knowledge-access-rollback.spec.ts), limpieza de fixtures en helpers y E2E previo. Solo se limpian organizaciones sintéticas propias.
- [Traducciones](../../src/lib/server-messages.ts), [.env.example](../../.env.example) y seguimiento 02/04/06/07/08/09/10/11/README.

## 3. Diseño, autorización y consistencia

`AI_KNOWLEDGE_ACCESS_ENABLED=false` es el valor por defecto. El lector nuevo necesita además habilitación explícita de `KnowledgeAccessPolicy` del negocio. Preparar, revisar o publicar no habilita ni asigna automáticamente. El asistente legacy debe existir mediante el procedimiento revisado de Fase 1. No se materializan especialistas.

Cada escritura exige `knowledge_base:manage`, módulo `AI_WHATSAPP` y organización activa. No acepta `organizationId` del formulario. Las asignaciones comprueban artículo/revisión e instancia en la misma organización; las FKs lo refuerzan. Las asignaciones restringen el acceso del asistente, no sustituyen los permisos de lectura de la página KB que ya tenían los usuarios del negocio. Los lectores de ejecución derivan la instancia `legacy-assistant@1` del contexto del negocio, nunca del texto del usuario ni de un parámetro libre de API.

Los cambios de artículo, publicación, asignación o política se serializan mediante un advisory lock y avanzan la versión de autorización del negocio. Editar, asignar o habilitar con versión obsoleta falla. El editor fija la versión al abrirse; un refresco en segundo plano no puede combinar texto antiguo con una versión nueva. Reabrir permite revisar el contenido actualizado. Abrir la revisión no modifica los hechos efectivos ni avanza esa versión. Las revisiones de contenido son insert-only en los servicios; publicar solo agrega fecha/autor. Los procesos con acceso directo privilegiado a PostgreSQL siguen siendo una frontera de confianza; no se promete protección contra modificaciones SQL administrativas.

La consulta usa una transacción Repeatable Read. La respuesta automática revalida la versión después del proveedor y nuevamente bajo bloqueo antes de admitir el envío. Si cambia, descarta/escala sin reenviar una respuesta obsoleta. Los borradores fallan con un estado recuperable; el probador no devuelve un resultado obsoleto. Un envío ya admitido no puede retirarse del proveedor. Los borradores previamente entregados a una persona siguen requiriendo su revisión humana.

## 4. Selección, límites y trazabilidad

Sin embeddings, dependencias ni nuevos servicios: se filtran palabras en título, contenido, categoría y etiquetas, y se puntúan título/etiquetas/categoría por encima de menciones en contenido. No hay sinónimos ni búsqueda semántica. Las etiquetas usan coincidencia exacta de palabra en la preselección; el texto usa coincidencia insensible a mayúsculas, sin extensión SQL de acentos.

- Hasta 500 caracteres y 12 términos de consulta; hasta 200 candidatas, orden estable por ID.
- Hasta 8 fuentes y 1200 caracteres de contenido por fuente. El fragmento comienza cerca de una coincidencia, permitiendo recuperar datos posteriores al carácter 1200.
- Se muestran elegibles, coincidencias, candidatas consideradas, seleccionadas, recortes y saturación del límite. Ninguna coincidencia implica cero referencias, sin rellenar con artículos arbitrarios.
- Caracteres del bloque serializado y estimación `ceil(caracteres/4)` visibles. Es una estimación del bloque de referencias, no tokens facturados ni el contexto completo con reglas e historial.
- `knowledge.retrieve` conserva en AuditLog IDs/versiones/hash de fuentes, posición/largo del fragmento, versión de política, contadores, hash de pregunta y requestKey del runtime. No guarda el texto de la pregunta, respuesta o fuente en ese evento. La revisión persistida permite reconstruir el fragmento.

El bloque de referencias es JSON y se identifica como datos no confiables, subordinados a las reglas. Esto reduce confusión de instrucciones, pero no certifica resistencia del modelo a prompt injection. Las fuentes no otorgadas y de otros negocios no entran al contexto. En el pipeline, el modo nuevo utiliza el bloque acotado completo; el recorte legacy de 3000 caracteres se conserva solo fuera del opt-in. Esto evita que la última capa vuelva a descartar fuentes ya seleccionadas, pero puede aumentar tokens frente al pipeline anterior; medir el presupuesto antes de activar.

La clasificación de PII sigue siendo responsabilidad de revisión: no hay detector automático que garantice que un artículo autorizado carezca de datos privados.

## 5. Evidencia de pruebas

| Verificación | Resultado | Evidencia local |
|---|---|---|
| Suite general, PostgreSQL vacío y 81 migraciones finales | **197 archivos / 1365 pruebas aprobadas**, 477,31 s | `/tmp/reymen-phase4-final-full.log` |
| Editor ante refresco concurrente, regresión adicional tras el último ajuste de UI | **1 prueba aprobada**, con fallo reproducido antes de la corrección | `/tmp/reymen-phase4-article-form.log` |
| Fuentes: revisar/publicar/asignar, borrador, revocación/reactivación, error y ES/EN/móvil | **2 casos Chromium aprobados** | `/tmp/reymen-phase4-knowledge-e2e.log` |
| Centro, canales, reglas, Inbox, respuesta manual y cron | **18 casos Chromium aprobados** | `/tmp/reymen-phase4-regression-e2e.log` |
| Rollback de conocimiento y cuentas con UI nueva | **2 casos Chromium aprobados** | `/tmp/reymen-phase4-rollback.log` |
| Rollback completo de UI y reglas | **2 casos Chromium aprobados** | `/tmp/reymen-phase4-legacy-rollback.log` |
| Build final, flags locales habilitados | Aprobado | `/tmp/reymen-phase4-build.log` |
| TypeScript independiente, `--noEmit --incremental false` | Aprobado | `/tmp/reymen-phase4-types.log` |
| Lint completo | 0 errores; 51 advertencias preexistentes | `/tmp/reymen-phase4-lint.log` |
| Esquema Prisma contra BD sintética final | Diff vacío | `/tmp/reymen-phase4-schema-diff.sql` |

Total: **1366 pruebas** entre suite general y regresión adicional; **24 casos distintos de navegador**. Los casos repetidos tras un ajuste no se cuentan dos veces. Node local: **24.19.0**. Las pruebas generales se ejecutaron con un worker y bases sintéticas nuevas; el índice final y sus FKs se validaron al aplicar las 81 migraciones.

Las pruebas cubren OWNER/MANAGER autorizados y AGENT/VIEWER/CLIENT denegados, módulo/negocio suspendido, FKs y consultas entre organizaciones, versiones obsoletas y concurrencia, fuente compartida sin duplicación por asistente, noveno artículo y dato al final, límite de 200 candidatas, hostilidad en fuentes, fallos durante proveedor simulado e idempotencia del único emisor. Se inspeccionaron las capturas `/tmp/reymen-phase4-knowledge-mobile.png` y `/tmp/reymen-phase4-source-mobile.png`; no se encontraron desbordamientos en 320/390/768/1280 px.

Las pruebas son locales, con PostgreSQL sintético, Chromium y proveedores/emisor simulados. No se consulta un proveedor de IA o canal real. La evaluación golden textual acertó la fuente esperada en **4/4 consultas (top 1)**; mide recuperación de la fuente correcta, no calidad de respuestas de un modelo real ni costo productivo.

## 6. Problemas pendientes y riesgos residuales

- Piloto de Fase 3 aplazado: faltan canal/cuenta/tenant, conector sandbox y validación externa.
- La recuperación léxica puede omitir equivalencias semánticas, acentos o coincidencias fuera de las 200 candidatas. La UI explica el límite; conviene afinar categorías/etiquetas y medir consultas reales antes de ampliar.
- El pipeline conserva sus efectos CRM existentes y su limitación de atomicidad ya documentada en Fase 3. Se comprueba la versión tras inferencia, pero no se reestructura toda su secuencia de escrituras en esta fase. No se amplía su autonomía ni se ofrecen garantías nuevas de herramientas.
- Cambios administrativos de reglas/canales/modelo mantienen sus guardas previas. La versión de esta fase cubre artículos/grants/publicación/política; no es un snapshot universal del prompt completo.
- AuditLog conserva referencias/hash sin texto nuevo; acordar la retención operativa antes del piloto. No se introduce limpieza automática.
- No se probaron dispositivos iOS físicos, proveedor real, workflows desplegados, carga productiva ni CI remoto Node 22.

## 7. Compatibilidad

Fuera del opt-in se conserva el lector de ocho artículos recientes, las reglas/identidad, los canales, el probador y el transporte existente. El editor agrega etiquetas y el borrado se convierte en desactivación recuperable. Dentro del opt-in, n8n/v1 recibe solo versiones autorizadas, con metadatos de selección; el `updatedAt` de una referencia corresponde a su revisión. No se amplían permisos por API ni se habilitan cuentas.

El nuevo código requiere el esquema aditivo incluso con el flag apagado, porque el modelo Prisma y las escrituras incluyen `knowledgeVersion`/revisiones. Se debe expandir el esquema en staging y actualizar toda la flota web/jobs antes de habilitar un negocio. Un binario anterior puede intentar borrar físicamente fuentes y chocar con las nuevas FKs; no es el rollback recomendado. No se ejecutaron migraciones reales ni se modificaron planes, compras, CRM comercial, POS o Lealtad.

## 8. Validación antes de habilitar

1. Crear una base vacía desechable. Aplicar las migraciones revisadas, generar Prisma y ejecutar pruebas/build. Nunca usar la base productiva para estas pruebas.
2. Mantener todos los flags apagados y comprobar las páginas y contratos legacy. Luego habilitar el modelo/UI y el flag de conocimiento exclusivamente en el entorno de validación; no hace falta habilitar conexiones para probar conocimiento.
3. Preparar la instancia legacy mediante la comparación/hash de Fase 1. Revisar contenido y PII, publicar cada versión y asignarla explícitamente. Probar preguntas antes de activar la política por negocio.
4. Comprobar noveno artículo, dato al final, consulta sin coincidencias, tags/categoría, límite de candidatas y fuente revocada. Comparar recuperación y respuestas del proveedor autorizado con el lector anterior antes del cutover.
5. Verificar roles y dos organizaciones. Revocar durante una inferencia simulada y comprobar cero envíos. Confirmar foco/errores y pantallas de 320/390/768/1280 px.
Comandos de referencia, después de definir `DATABASE_URL` y `TEST_DATABASE_URL` hacia una base **local vacía y desechable**, y usar claves exclusivamente de fixture:

```bash
npx prisma migrate deploy
npx prisma generate
npm test -- --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

Para Chromium, iniciar el build en localhost con la base sintética de E2E y flags habilitados; definir `E2E_BASE_URL` y `PLAYWRIGHT_CHROMIUM_PATH`, y ejecutar `npx playwright test e2e/knowledge-access.spec.ts --workers=1`. El rollback usa el mismo build con el flag de conocimiento apagado y `E2E_KNOWLEDGE_ROLLBACK=true`, ejecutando `e2e/knowledge-access-rollback.spec.ts`.

6. Solo tras revisión independiente, acordar tenant y criterios de piloto. Este documento no autoriza despliegue ni cambios de datos reales.

## 9. Rollback

Deshabilitar la política del negocio vuelve al lector anterior y conserva revisiones/asignaciones. También puede apagarse `AI_KNOWLEDGE_ACCESS_ENABLED`; mantener los flags de canales/modelo/UI según sus propios procedimientos, sin convertir conversaciones vinculadas al transporte antiguo.

El lector anterior usa todos los artículos activos recientes, incluso borradores; no respeta los grants nuevos. Por eso, antes de ese retorno, revisar y desactivar fuentes que deban seguir excluidas. Desactivarlas conserva el contenido; no borrar ni restaurar una BD vieja. Para retirar una única fuente con el lector nuevo, revocar su asignación o desactivarla, sin apagar la política.

Drenar o reconciliar trabajos en curso al cambiar flags/flota. Conservar la migración; no hacer down/drop ni borrar revisiones. No se deshacen mensajes ya enviados ni efectos CRM confirmados. El rollback de flags es preferible al binario anterior.

## 10. Recomendación para la siguiente fase

No iniciar Fase 5 hasta autorización explícita y hasta resolver sus dependencias de roadmap (incluyendo piloto externo de Fase 3 y evaluación de respuestas/presupuesto). Esta fase aporta permisos de fuentes y revisión reproducible; no constituye aprobación para activar Mark, Alex, herramientas, marketplace ni producción.

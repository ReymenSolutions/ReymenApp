# Reymen AI Agents — auditoría y diseño, etapa 1

Fecha: 2026-10-20. Repositorio examinado: **ReymenApp**, checkout local `codex/pos-manual-reward-redemption`, commit **`6fd1ef66ee7ec3a41bb38bfdb890df76ed217042`**. Árbol limpio al iniciar. Esta auditoría describe ese snapshot; no certifica el HEAD remoto de main ni la versión desplegada en el VPS. La referencia local `origin/main` está atrasada respecto del checkout. No se hizo fetch, checkout, instalación, migración ni despliegue.

## Seguimiento actual

La Fase 0 de hardening se completó: [12_IMPLEMENTACION_FASE_0.md](12_IMPLEMENTACION_FASE_0.md). Después, el propietario autorizó la Fase 1: [13_IMPLEMENTACION_FASE_1.md](13_IMPLEMENTACION_FASE_1.md). Los documentos 01–11 conservan la auditoría y propuestas originales; sus referencias a fuente corresponden al commit auditado, no a las líneas actuales. Los apartados de seguimiento registran los avances posteriores. No se ha desplegado ni autorizado la activación productiva de especialistas.

## Seguimiento de Fase 1

Tras autorizar «continua fase 1», se implementó el modelo aditivo y adapter en una rama nueva. Ver [13_IMPLEMENTACION_FASE_1.md](13_IMPLEMENTACION_FASE_1.md) para alcance, pruebas y rollback. La autorización previa de Fase 0 se conserva como antecedente; no limita esta nueva autorización a Fase 0. No se autorizaron ni ejecutaron despliegues o fases posteriores.

## Seguimiento de Fase 2

Se continuó con la interfaz sobre el adapter en `codex/ai-center-phase2-interface`. El alcance, flag de rollback, evidencia y pendientes se registran en [14_IMPLEMENTACION_FASE_2.md](14_IMPLEMENTACION_FASE_2.md). Este seguimiento actualiza las referencias históricas anteriores a fases no iniciadas. No incluye conexiones/routing de Fase 3 ni despliegue.

## Seguimiento de Fase 3

Se implementó la base local de cuentas/routing en `codex/ai-center-phase3-channels`: [15_IMPLEMENTACION_FASE_3.md](15_IMPLEMENTACION_FASE_3.md). El propietario pidió posponer la selección del piloto; siguen pendientes conector sandbox, verificación externa y cutover. No se activaron cuentas reales ni especialistas ni se inició Fase 4.

## Dictamen ejecutivo

**Confirmado mediante código:** existe una base considerable: Next.js/React, PostgreSQL/Prisma, autenticación, módulos, conversaciones multicanal, reglas del negocio, artículos, proveedor de IA, ledger, presupuestos, borradores y análisis de oportunidades. “Agente” actualmente se contabiliza como canal habilitado; no existe todavía el catálogo de especialistas del prompt.

**Confirmado mediante prueba (aislada):** 18 comprobaciones en memoria terminaron correctamente. Entre ellas se reprodujeron dos defectos: un VIEWER alcanza las escrituras de artículos e identidad sin control de permiso; un fallo genérico del proveedor deja la respuesta automática en `GENERATING` sin escalar. “Prueba aprobada” aquí significa que se confirmó el comportamiento observado, incluso cuando ese comportamiento es un defecto. No hubo conexiones a BD, proveedores ni n8n.

**Inferido — recomendación:** continuar sobre un monolito modular. Antes de añadir agentes, cerrar permisos, recuperación durable, identidad por canal y trazabilidad. Reutilización orientativa: **65 % de 20 capacidades evaluadas** (13 equivalentes completos ponderados); rango de planificación 55–75 %, no porcentaje de líneas de código ni garantía de avance. Método en documento 03.

**Pendiente de validación:** funcionamiento real de los seis conectores en n8n, credenciales/scopes/ventanas de Meta, despliegue actual, contenido de datos históricos, rendimiento, conciliación con facturas y prueba visual en dispositivos. No se atribuye ninguna pérdida histórica de clientes a este módulo sin evidencia.

## Entregables y lectura recomendada

| Documento | Propósito |
|---|---|
| [01 — Estado actual](01_AUDITORIA_ESTADO_ACTUAL.md) | Pantallas, controles, roles, APIs, canales, conocimiento, ejecución y consumo |
| [02 — Hallazgos](02_HALLAZGOS_Y_RIESGOS.md) | Evidencia, severidad, consecuencias y correcciones propuestas |
| [03 — Arquitectura](03_ARQUITECTURA_OBJETIVO.md) | Core / Agents / Office, orquestación, límites y reutilización |
| [04 — Datos y migración](04_MODELO_DATOS_Y_MIGRACION.md) | Entidades, compatibilidad, backfill y rollback propuestos |
| [05 — UX/UI](05_UX_UI_AI_AGENT_CENTER.md) | Navegación, wireframes, componentes y móvil |
| [06 — Seguridad](06_SEGURIDAD_Y_GOBERNANZA.md) | Amenazas, permisos, aprobaciones y operación |
| [07 — Roadmap](07_ROADMAP_IMPLEMENTACION.md) | Fases con alcance, dependencias, pruebas y estimaciones |
| [08 — QA](08_PLAN_QA_Y_REGRESION.md) | Evidencia ejecutada, cobertura pendiente y criterios de salida |
| [09 — Compatibilidad](09_MATRIZ_COMPATIBILIDAD.md) | Destino de funcionalidades y datos existentes |
| [10 — ADRs](10_DECISIONES_ARQUITECTONICAS.md) | Decisiones propuestas y alternativas |
| [11 — Backlog](11_BACKLOG_IMPLEMENTACION.md) | Historias ejecutables y aceptación |
| [12 — Implementación Fase 0](12_IMPLEMENTACION_FASE_0.md) | Hardening implementado, evidencia y rollback |
| [13 — Implementación Fase 1](13_IMPLEMENTACION_FASE_1.md) | Modelo aditivo, adapter y observación durable |
| [14 — Implementación Fase 2](14_IMPLEMENTACION_FASE_2.md) | Interfaz sobre el adapter, pruebas y rollback visual |
| [15 — Implementación Fase 3](15_IMPLEMENTACION_FASE_3.md) | Cuentas, contrato versionado y routing local; piloto externo pendiente |
| [16 — Implementación Fase 4](16_IMPLEMENTACION_FASE_4.md) | Conocimiento versionado, publicación y grants opt-in |
| [17 — Inicio Fase 5](17_INICIO_FASE_5_MARK.md) | Núcleo de Mark y simulación con datos ficticios; MVP real pendiente |

Propietario: leer 02 → 03 → 05 → 07. Ingeniería: 01 → 06 → 04 → 09 → 10 → 08 → 11.

## Convención de evidencia

- **C — Confirmado mediante código:** lógica visible en el commit citado; no prueba operación de producción.
- **P — Confirmado mediante prueba:** ejecución local aislada descrita en 08; alcance explícito.
- **I — Inferido:** hipótesis de impacto, estimación o **propuesta aún no implementada**.
- **V — Pendiente de validación:** requiere datos, despliegue, navegador o servicios no examinados.

Cada tabla declara su nivel por fila o en su introducción. En documentos de diseño, todo lo propuesto es **I**, salvo referencias expresamente C/P/V. Los enlaces a código corresponden al snapshot indicado; abrir el mismo commit para conservar líneas. Ausencia en las rutas examinadas no equivale a ausencia en todos los servicios externos.

## Límites y próxima autorización al cierre de la auditoría original

Solo se crearon estos documentos en `docs/ai-agents/`. No se modificó código funcional, BD, dependencias, integraciones o servidor; no se crearon commits ni PR. Las suites con fixtures de BD no se ejecutaron. Las habilidades anunciadas de seguridad/configuración no estuvieron disponibles en el catálogo de esta sesión; se usó inspección directa y no se ejecutó configuración de entorno.

La etapa 1 termina aquí. Para seguir se requiere autorización explícita para **implementar la fase 0B de correcciones y preparar la fase 1 en una rama con pruebas sobre una BD desechable**. Esa autorización no incluye producción: cualquier migración o despliegue se revisará por separado con artefacto, copia verificada y rollback concretos. No se necesita decidir todavía todo el marketplace.

## Seguimiento de Fase 4

Se implementó el acceso a conocimiento compartido con revisiones/publicación, asignaciones y consulta acotada por pregunta en `codex/ai-center-phase4-knowledge`: [16_IMPLEMENTACION_FASE_4.md](16_IMPLEMENTACION_FASE_4.md). El lector nuevo queda desactivado globalmente y exige además revisión/habilitación por negocio. El piloto externo de Fase 3 sigue pendiente. Al cierre de Fase 4 no había despliegue ni inicio de Fase 5; el avance posterior figura abajo.

## Inicio de Fase 5

Tras «inicia», se preparó el núcleo acotado de Mark y el arnés mínimo de simulación: [17_INICIO_FASE_5_MARK.md](17_INICIO_FASE_5_MARK.md). Usa únicamente fixtures, no un LLM ni herramientas/clientes reales. Queda detrás de un flag apagado. AG-011 sigue en curso: no hay Mark activo, y continúan pendientes el piloto de Fase 3 y presupuesto/evaluación para un proveedor real. No se inició Alex ni marketplace.

## Publicación y piloto recomendado

El trabajo acumulado se publica en [PR #123](https://github.com/ReymenSolutions/ReymenApp/pull/123). La integración de main, comandos de actualización y propuesta de piloto están en [18_PUBLICACION_Y_PILOTO_RECOMENDADO.md](18_PUBLICACION_Y_PILOTO_RECOMENDADO.md). El propietario aceptó continuar y fijó $25 MXN diarios, conservando $500 mensuales y $1 por turno como límites propuestos. Publicar no activa Mark real ni modifica el VPS.

## Base de presupuesto de piloto

El siguiente incremento separado prepara reservas de $25 MXN/día, $500/ciclo y $1/raíz, con opt-in y compromisos durables: [19_BASE_PRESUPUESTO_PILOTO.md](19_BASE_PRESUPUESTO_PILOTO.md). No activa un proveedor ni completa la contabilidad incierta o la atribución por instancia de Fase 8.

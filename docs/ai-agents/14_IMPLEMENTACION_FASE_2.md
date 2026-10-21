# 14 — Fase 2: interfaz del AI Agent Center

Fecha: 20 de octubre de 2026, America/Monterrey. Rama: `codex/ai-center-phase2-interface`. Base: `f776d39`, cierre de Fase 1. Se continuó con la siguiente fase del roadmap ante la indicación «continua», comunicando el alcance de interfaz sobre el adapter.

## 1. Alcance y límites

Se implementa la interfaz de Fase 2 sobre el asistente existente: resumen, lista de asistentes, perfil, presentación de canales, conocimiento, prueba y consumo. Se preservan las URLs anteriores y se añade un flag de interfaz independiente del modelo. La única identidad representada es el asistente legacy; no se muestran especialistas ficticios ni ofertas de marketplace.

No se modificaron producción, VPS, conexiones, routing, webhooks, transportes, workers, planes, cupos, dependencias, esquema ni migraciones. No se activan Mark, Alex, herramientas ni observación por abrir una pantalla. Tampoco se desarrolla Fase 3. Solo se utilizaron datos sintéticos en bases separadas para pruebas.

## 2. Cambios y propósito

| Área | Cambio |
|---|---|
| Resumen | Métricas de conversaciones reales, cinco conversaciones recientes y acceso al asistente. Los contadores no se deducen del tamaño de la lista reciente |
| Mis asistentes y perfil | Tarjeta del asistente actual, nombre público editable, capacidades existentes explicadas y actividad paginada. No hay botones de herramientas inexistentes |
| Nombre | Se usa el contrato de Fase 1 con versión/hash cuando existe instancia; conflictos no pisan cambios ajenos. Recargar obtiene la versión actual y conserva el texto escrito; errores desconocidos no exponen detalles internos |
| Canales | Seis canales existentes, última actividad recibida y estado «Conexión sin verificar». OFF/SUGGEST/AUTO se presentan como modos, sin confundirlos con salud del conector |
| Número | Acción separada para modificar únicamente el teléfono existente, sin sobrescribir el nombre. Guardar un número no conecta una cuenta |
| Conocimiento | Búsqueda, categoría y páginas de diez artículos; contenido y reglas del negocio desplegables. Se mantienen las acciones de artículos y Rulebook, con sus permisos |
| Prueba | Se conserva el preview real existente. Se explica el consumo y se exige reconocerlo en la interfaz nueva. Reiniciar ignora resultados tardíos; no cancela ni devuelve el consumo de una llamada iniciada |
| Consumo | Se conserva el servicio y la presentación comercial existentes dentro de la navegación común; no se inventa atribución por especialista |
| Estados | Skeleton, contenido, vacío con siguiente paso y error con reintento. Un fallo de consulta llega al error boundary, no se transforma en cero |
| Accesibilidad | Navegación con wrap/aria-current, formularios de 16px, controles de 44px, etiquetas, confirmación Radix de AUTO, teclado de radios y restauración de foco en diálogos |
| Preferencias | La raíz usa la sesión validada con preferencias actuales de la base. Guardar cambios rápidos se serializa para que un guardado anterior no restaure otro tema/idioma |

Definición de métricas: total = todas las conversaciones propias, incluidas archivadas; abiertas = OPEN sin archivar; requieren atención = ESCALATED sin archivar. La lista reciente excluye archivadas y abarca los canales existentes. No se calcula un porcentaje de «resolución por IA» porque el estado actual no lo demuestra.

Las ejecuciones muestran metadatos y pasos de Fase 1, diez por página. No exponen snapshot privado, prompts, teléfonos, payloads ni IDs de mensajes. La configuración observada al admitir un trabajo no certifica el prompt efectivo ni la recepción externa. El historial de clientes permanece en el CRM; esta actividad corresponde a trabajos del asistente con seguimiento.

La búsqueda visual de artículos no cambia el retrieval: la interfaz advierte el límite actual de hasta ocho artículos y 1200 caracteres por artículo. Asignaciones/grants/revisiones de fuentes corresponden a Fase 4. El preview no es el playground sin efectos de Fase 7: usa el proveedor existente y puede consumir capacidad.

## 3. Archivos modificados

- `src/lib/ai/agents/center-{ui,context,copy,data}.ts`: flag, contexto autenticado, textos ES/EN y consultas propias paginadas.
- `src/lib/portal-nav-tabs.ts`: navegación nueva y fallback, filtrados por permiso.
- `src/app/(portal)/portal/{whatsapp,knowledge-base,ai-lab,ai-usage}`: wrappers compatibles y estados; nuevas rutas `ai-agents`, `ai-agents/assistant` y `ai-channels`.
- `src/components/portal/ai-center/*`: frame, resumen, tarjeta, nombre, traza, conocimiento, paginación y estados. `LegacyAiCenter`/`LegacyKnowledge` conservan las pantallas previas para el fallback.
- `PortalShell`, `PortalSidebar`, layout y `PortalSectionTabs`: indicador de interfaz, nombre del grupo y navegación responsiva; no se reorganizan otros módulos.
- `src/app/layout.tsx`, `src/context/preferences.tsx` y su suite: corrigen la discrepancia entre preferencia guardada y JWT emitido al iniciar sesión, detectada al recargar durante QA visual. La raíz usa el guard existente con caché invalidada por la acción de preferencias; no se cambian cookies de autenticación ni permisos.
- `AgentModesPanel`, `RulebookEditor`, `AgentTester`, `AssistantConfigForm`: opciones de lenguaje sencillo que mantienen sus defaults anteriores, confirmación/foco, preview seguro y formulario de número.
- `ArticleDialog`, `DeleteArticleButton`, `ui/dialog`: etiquetas y tamaños accesibles. El cierre táctil/traducido es opt-in; los demás diálogos mantienen su default.
- `src/actions/whatsapp-assistant.ts`: nueva escritura de teléfono con permiso, organización activa y puente transaccional existente.
- `center-data.test.ts`, `portal-nav-tabs.test.ts`, `ai-center/Interaction.test.tsx`, `ai-authorization.test.ts`, `e2e/ai-center-phase2.spec.ts`, `e2e/rulebook.spec.ts`: cobertura de datos, permisos, interacciones y navegador.
- `.env.example` y seguimiento en `docs/ai-agents/`.

Commits funcionales: `b45700d` (lectores/flag y teléfono), `71b4eca` (preferencias), `d829176` (interfaz y pruebas de navegador) y `6a4794e` (tamaños táctiles). El cierre documental se mantiene separado.

## 4. Autorización y compatibilidad

Las rutas derivan la organización de la sesión y exigen AI_WHATSAPP. Los enlaces de edición no sustituyen autorización: las acciones conservan controles server-side y pruebas negativas. El número exige además organización activa. Las trazas y el contrato versionado permanecen restringidos a `knowledge_base:manage`. El resumen solo consulta nombres/métricas si se permite ver conversaciones; AGENT puede consultar información básica y artículos, sin configuración privada, edición, prueba ni consumo restringido.

`AI_AGENT_CENTER_UI_ENABLED=false` es el default. En ese estado `/portal/whatsapp` y `/portal/knowledge-base` renderizan las vistas anteriores; las rutas nuevas redirigen al centro anterior. `/portal/ai-lab` y `/portal/ai-usage` conservan sus URLs. El rollback visual no restaura una copia byte a byte de componentes compartidos: se mantienen mejoras de etiquetas/tamaño, lectura de preferencias actuales y protección contra respuestas tardías del preview. La lectura de raíz utiliza la caché existente de validación de sesión (15s, invalidada después de guardar preferencias); comparte esa dependencia de BD con las rutas privadas existentes.

`AI_AGENT_MODEL_ENABLED` continúa siendo independiente. La UI no lo enciende ni crea instancia/backfill/rollout. Con modelo apagado no consulta las tablas de ejecuciones ni requiere preparar una instancia para mostrar el asistente; el nombre usa la acción legacy protegida. Para leer trazas, el esquema de Fase 1 debe haberse expandido primero en un entorno autorizado. La UI nunca se usa como sustituto de ese procedimiento.

## 5. Evidencia de pruebas

Entorno: Node 24.19.0, Prisma 6.19.3, PostgreSQL 16 aislado sin puertos publicados, Chromium local. Bases nuevas `reymen_ai_phase2_test` y `reymen_ai_phase2_e2e`, con las 78 migraciones existentes; ninguna migración nueva. Se accede mediante socket Unix. Sin proveedor o transporte real.

| Verificación | Resultado |
|---|---|
| Pruebas focalizadas | 29/29 en cinco archivos, más 2/2 de preferencias; la regresión final incluye ambos grupos |
| Regresión completa final | **193/193 archivos, 1309/1309 pruebas aprobadas**, 280.37 s; un worker, sin compilación/navegador concurrentes, ambos flags apagados |
| TypeScript independiente | `npx tsc --noEmit --incremental false` aprobado |
| Lint completo | 0 errores y 51 advertencias preexistentes; una importación sin uso de la vista copiada se retiró, frente a las 52 de Fase 1 |
| Build local | Compilación y TypeScript del build aprobados con ambos flags habilitados |
| Chromium: interfaz nueva | **7/7 aprobadas**, 1.0 min; resumen, contrato versionado, error de transporte, paginación, conocimiento, permisos, confirmación AUTO y foco |
| Responsive | Siete rutas × cinco anchos × dos temas = **70 combinaciones sin overflow global**, más ES/EN y zoom CSS al 200%; tema/idioma comprobados tras recargas |
| Grids | n=1…9 en 1/2/3/4 columnas, 36 distribuciones, usando el CSS real de MetricGrid |
| Compatibilidad con UI nueva | **9/9 aprobadas**, 22.1 s: Rulebook, inbox, control humano, respuesta manual y autenticación del cron |
| Repetición tras ajuste táctil | **16/16 aprobadas**, 1.2 min, interfaz nueva y nueve flujos anteriores en la misma corrida; build/TypeScript y lint de los cinco archivos ajustados también aprobados |
| Rollback visual | **2/2 aprobadas**, 11.5 s: mismo build con ambos flags apagados; pantallas legacy, redirección de las tres rutas nuevas, cero instancias/rollouts creados y guardado de Rulebook |
| Revisión del diff/documentos | Sin errores de whitespace; 255 enlaces locales con destino existente; sin cambios de esquema, dependencias, planes, deploy o transporte |

Las capturas sintéticas generadas por E2E se inspeccionaron a 390px/oscuro y 1280px/claro/inglés. La prueba de zoom es zoom CSS en Chromium, no una certificación del zoom nativo de Safari. Las pruebas usan teclado para radios y cierre/restauración de foco; no simulan un lector de pantalla físico.

Después de la suite completa se ajustó únicamente la altura mínima de botones secundarios de estas pantallas. Se repitieron build/TypeScript, lint de los archivos afectados y Chromium para verificar el layout; no se modificó lógica ni se añadió otra suite para comprobar clases CSS.

Durante la validación se corrigieron selectores del arnés que contaban texto para lectores de pantalla o coincidían con el anunciador de Next.js. La prueba de temas reprodujo el defecto real de preferencias guardadas frente a claims JWT antiguos, corregido en esta entrega. La implementación final lee la sesión validada. Una corrida inicial de regresión coincidió con compilación/navegador y agotó el timeout de una transacción de presupuesto (5s). Se interrumpió y la repetición aislada pasó íntegra; no se ampliaron timeouts del código de negocio ni se relajaron pruebas.

Las pruebas focalizadas verifican conteos frente a cinco filas, filtros y categorías propios, páginas completas, actividad USER diferenciada de mensajes salientes, flag de modelo apagado, errores de BD propagados, trazas sin configuración privada, permisos por rol y aislamiento, número sin sobrescribir nombre, organización suspendida, conflicto de versión, edición conservada, reset con respuesta tardía y error genérico seguro.

## 6. Validación reproducible

1. Usar únicamente bases desechables nuevas para unitarias y E2E, con variables `DATABASE_URL`/`TEST_DATABASE_URL` apuntando a ellas. Aplicar allí las migraciones existentes; no reutilizar una URL de producción.
2. Ejecutar suite completa con un worker y timeout de 60s/hooks 30s; TypeScript, lint y build. Mantener claves externas vacías y transporte simulado.

```bash
DATABASE_URL="$PHASE2_TEST_DATABASE_URL" TEST_DATABASE_URL="$PHASE2_TEST_DATABASE_URL" \
  AI_AGENT_MODEL_ENABLED=false AI_AGENT_CENTER_UI_ENABLED=false \
  RESEND_API_KEY= ANTHROPIC_API_KEY= OPENAI_API_KEY= \
  env -u AI_PROVIDER -u AI_DRAFT_PROVIDER -u N8N_BASE_URL \
  npm test -- --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000
npx tsc --noEmit --incremental false
npm run lint
DATABASE_URL="$PHASE2_TEST_DATABASE_URL" \
  AI_AGENT_MODEL_ENABLED=true AI_AGENT_CENTER_UI_ENABLED=true npm run build
```

   `PHASE2_TEST_DATABASE_URL` debe contener la URL de la base desechable; las claves de sesión y demás valores requeridos deben ser exclusivamente de pruebas. Ejecutar la regresión sin compilación/navegador en paralelo si el entorno comparte recursos limitados.

3. Levantar el build local con ambos flags habilitados y ejecutar `e2e/ai-center-phase2.spec.ts` con Playwright y un worker. Los fixtures se crean y limpian exclusivamente dentro de su organización sintética.
4. Revisar páginas a 320/360/390/768/1280px, claro/oscuro, ES/EN, navegación por teclado, diálogos y zoom. Verificar también usuario sin permiso de gestión y fallo de guardado que conserva el texto.
5. Ejecutar `e2e/{rulebook,inbox,conversation-manual-reply,webhook-retry-cron}.spec.ts` con UI nueva. Reiniciar el mismo build con ambos flags apagados y ejecutar `E2E_AI_UI_ROLLBACK=true npx playwright test e2e/ai-center-rollback.spec.ts e2e/rulebook.spec.ts --workers=1`, con `E2E_BASE_URL`/`DATABASE_URL` locales configurados. Esto comprueba enlaces anteriores y redirecciones nuevas sin reconstruir ni borrar datos.
6. En una revisión posterior autorizada, comprobar dispositivos físicos y lectores de pantalla, CI Node22 y comportamiento con datos representativos. Esta entrega no certifica el VPS.

## 7. Pendientes y riesgos residuales

- La última actividad recibida no prueba que una conexión siga saludable; no hay nueva reconexión/OAuth/routing. Eso requiere Fase 3 e inventario real.
- Las trazas son observación de los workers legacy y pueden retrasarse; no son un SLA ni evidencia de entrega externa.
- El preview conserva costo real y las condiciones del proveedor existente. Reset oculta el resultado; no cancela una llamada iniciada.
- Lecturas/count/página no forman un snapshot de toda la navegación: la actividad concurrente puede cambiar resultados entre páginas, sin borrar registros.
- Se conservan los pendientes de carga, costos y conexiones de Fases 0/1. No se atribuyen pérdidas históricas de clientes a esta interfaz.
- La revisión en Chromium no sustituye Safari/iPhone, teclado virtual, lector de pantalla físico, medición exhaustiva de contraste o CI Node22.

## 8. Rollback

Apagar `AI_AGENT_CENTER_UI_ENABLED` en un entorno autorizado y reiniciar la aplicación restaura las pantallas y navegación anteriores sobre los mismos datos. No borrar tablas, restaurar bases antiguas ni revertir las correcciones de seguridad de Fase 0. El flag del modelo y la observación por tenant no cambian al apagar la UI. Si se necesita revertir código, usar la base `f776d39` conservando esquema y datos de Fase 1; conciliar trabajos conforme a su runbook. Nada de esto se ejecutó sobre producción.

## 9. Siguiente fase

La siguiente fase del roadmap es Fase 3, conexiones/routing, con validación de cuentas y contratos reales. No se inició. Antes de desplegar esta interfaz: revisión del diff, CI Node22, validación de usuarios/dispositivos, ensayo en staging autorizado y aprobación separada del despliegue. La pantalla de canales por sí sola no resuelve esos requisitos ni autoriza especialistas.

# 12 — Implementación Fase 0: hardening y estabilización

Fecha: 20 de octubre de 2026 (UTC). Rama: `codex/ai-center-phase0-hardening`. Base funcional: `6fd1ef66ee7ec3a41bb38bfdb890df76ed217042`; auditoría conservada por separado en `3cbca3b`. Esta Fase 0 corresponde al hardening que la auditoría llamaba Fase 0B. No incluye el modelo de agentes de Fase 1.

## 1. Hallazgos corregidos y límites

| Hallazgo | Implementación en este alcance | Estado |
|---|---|---|
| H01 autorización | Guardia compartida de permiso y módulo para artículos, identidad y Rulebook. Permisos de escalar/resolver/leer historial; cursor limitado al hilo; draft ajeno rechazado antes de enviar | Corregido y cubierto por pruebas negativas |
| H02 recuperación | Error del proveedor termina el borrador y deriva la conversación; generación interrumpida recuperable; fallo de envío no se devuelve como respuesta exitosa | Corregido, condicionado a disponibilidad de BD y ejecución del cron para recuperar procesos muertos |
| H03 canal | Teléfono/correo/usuario e ID explícito se validan por canal y organización; OPEN/ESCALATED conservan control humano; estado por teléfono usa WhatsApp por defecto y canal explícito opcional | Corregido por canal. Separar dos cuentas del mismo canal requiere el modelo de conexiones futuro y queda pendiente |
| H04 control humano | Se comprueba aiHandled, asignación, estado, última interacción, organización, módulo y modo tras inferencia y antes de enviar. Admisión y actualizaciones humanas se serializan con bloqueo de fila | Corregido dentro de App; un envío externo ya admitido no se puede retirar |
| H05 persistencia | Trabajos internos de respuesta y análisis CRM existentes se admiten con el mensaje en la misma transacción; claims atómicos, leases, límites y recuperación por cron | Mecanismo mínimo implementado usando WebhookEvent, sin nuevas tablas/dependencias |
| H07 etiquetas | Editar un artículo sin enviar tags conserva las etiquetas previas | Subcaso corregido; relevancia/RAG/versiones fuera de esta fase |

Las alertas automáticas de escalamiento usan `notifyAdmins` y la plantilla ya empleada por el escalamiento manual. Conservan estado, fecha, mensaje de sistema y auditoría. El correo sigue siendo best-effort según el servicio existente: no se promete entrega garantizada de notificaciones.

## 2. Archivos modificados

### Autorización y controles existentes

- `src/lib/guards.ts`: `requireAiManager` reutiliza requireOrgPermission y assertModuleEnabled.
- `src/actions/knowledge-base.ts`, `whatsapp-assistant.ts`, `rulebook.ts`: autorización uniforme; tags omitidos se preservan.
- `src/actions/conversations.ts`: permisos de historial/escalar/resolver, cursor por conversación y pertenencia del borrador; mensaje manual y toma de control se guardan juntos bajo bloqueo de fila.
- `src/components/portal/AssistantConfigForm.tsx`: controles de edición deshabilitados sin permiso.
- `src/app/(portal)/portal/knowledge-base/page.tsx`, `portal/whatsapp/page.tsx`: controles existentes respetan permisos. Los eventos internos de IA no contaminan el indicador de integración externa. No se cambió la navegación.

### Canales, trabajos y recuperación

- `src/lib/webhook-processors.ts`: validación compatible, identidad de hilo por canal, deduplicación concurrente, continuidad escalada y admisión transaccional de trabajo. CRM continúa compartiendo el contacto entre canales.
- `src/app/api/v1/conversations/status/route.ts`: filtro de canal y teléfono normalizado, fallback para registros históricos sin phoneKey. ID explícito inexistente/ajeno/incompatible devuelve 404; búsqueda de teléfono sin hilo conserva respuesta normal sin conversación.
- `src/lib/ai-auto-jobs.ts` (nuevo): contratos internos/admisión en WebhookEvent.
- `src/lib/ai-auto-reply.ts`: claims, recuperación, estados terminales, control humano, alertas y envío con intención persistida antes del efecto externo.
- `src/lib/ai-draft.ts`: claim condicional de regeneración, protección de finalización y conservación del registro ante presupuesto agotado.
- `src/lib/ai-pipeline.ts`: recuperación del análisis existente y comprobación del turno esperado; conserva sus reglas comerciales.
- `src/lib/webhook-retry.ts`: separa trabajos internos de los reintentos de entregas de conectores.
- `src/app/api/cron/retry-webhooks/route.ts`: recuperación interna además del reintento existente, bajo el mismo CRON_SECRET. Añade resúmenes `ai` y `pipeline` a la respuesta.

### Pruebas

- Nuevas: `src/actions/ai-authorization.test.ts`, `src/lib/ai-phase0-recovery.test.ts`.
- Ampliadas: `src/lib/{inbox-ingest,ai-draft,ai-pipeline}.test.ts`, rutas status y retry-webhooks.
- `e2e/conversation-manual-reply.spec.ts`: espera el POST concreto del envío y verifica persistencia, para no confundir otro Server Action del inbox con el envío manual.

Lista autoritativa: `git diff --name-status 6fd1ef6..HEAD`. Los documentos de auditoría inicial están separados de las correcciones funcionales.

Commits funcionales revisables: `38f20bc` (permisos), `462f50f` (canales) y `0a3ce05` (recuperación/control humano). Se entregan como una unidad; no desplegar commits intermedios.

## 3. Decisiones de implementación y discrepancias comprobadas

### Permisos y aislamiento

Los hallazgos se confirmaron en el código. La sesión no sustituye al permiso ni al módulo; las acciones ahora aplican ambos antes de escribir. Historial y operaciones del inbox emplean el acceso existente CRM **o** AI_WHATSAPP, coherente con el inbox actual. No se impone AI_WHATSAPP a una organización que solo tiene CRM para responder manualmente.

No se añadieron roles ni se ampliaron permisos. CLIENT es rol de plataforma, no el interlocutor de WhatsApp. Las pruebas comprueban OWNER/MANAGER legítimos y rechazos AGENT/VIEWER/CLIENT para configuración, anónimo, módulo inactivo e IDs ajenos.

### Contratos de canales

La auditoría detectó correctamente la mezcla por teléfono/correo. La prueba antigua de email/enquiry esperaba reutilizar hilo; se corrigió deliberadamente: los hilos son distintos y el Lead sigue compartido. Un ID explícito de otro tenant/canal ya no crea un hilo sustituto silenciosamente.

La validación debe aceptar valores opcionales `null` que el código previo toleraba. La revisión independiente detectó esa incompatibilidad en la primera versión del parche y se corrigió con prueba específica. Los alias y el canal omitido en llamadas legacy por ID mantienen su funcionamiento. No se tocaron URLs, credenciales, firmas, cuentas ni workflows de los conectores.

No se dividieron hilos históricos ya mezclados ni se reconstruyeron mensajes: eso exigiría evidencia y un plan de datos separado.

### Persistencia mínima y reintentos

Se eligió WebhookEvent porque ya dispone de JSON, unicidad por organización/origen/ID, estados, intentos y claimedAt. Se usa `source=ai-center` con `eventType=ai.auto_reply` o `ai.pipeline`. Los IDs internos son estables por Message; no se reutiliza el ID de entrega n8n ni se altera su deduplicación.

La transacción de ingreso guarda mensaje, resumen del hilo y trabajos internos antes del ACK. `after()` acelera el flujo normal; el cron recupera si el proceso se corta. El análisis CRM también tenía esa dependencia efímera, por lo que se incluyó sin crear un nuevo agente ni modificar sus reglas de oportunidad/cierre.

- Lease: 10 minutos, superior al timeout/retry configurado del proveedor.
- AUTO: hasta tres claims de trabajo; esperas de 1/5 minutos para fallos recuperables de infraestructura. El último lease también se reconcilia; no queda abandonado por alcanzar el límite.
- Pipeline: hasta tres claims; espera de 5 minutos para preparación pendiente del contacto. Ejecución incierta queda FAILED para revisión y no se repiten posibles escrituras CRM.
- Proveedor/dispatch inciertos: no hay repetición automática del efecto. Se conserva el intento y se deriva o registra fallo terminal. El SDK mantiene su retry existente; no se añadió otro bucle de proveedor.
- Lote de recuperación predeterminado: tres trabajos de cada tipo por llamada. Estado y cola son inspeccionables en WebhookEvent. No se añadió limpieza ni borrado de registros de trabajo.

La recuperación usa el endpoint de cron existente, **fuera** de la transacción global del reloj de automatizaciones. `deploy/install-cron.sh` define retry cada 10 minutos; no se cambió ni se ejecutó el instalador. El tiempo de recuperación tras una caída depende de ese cron, del lease y de la cola. El flujo normal conserva ejecución inmediata posrespuesta.

Los borradores SUGGEST usan un claim condicional por estado/updatedAt; una regeneración competidora no lanza otra llamada y una finalización tardía no revive un borrador descartado. El registro de presupuesto agotado se conserva y puede recuperarse al restablecer capacidad. El umbral de generación abandonada pasó de 90 segundos a 10 minutos para no competir con una llamada todavía dentro de su timeout/retry.

### Control humano y envío externo

La respuesta preparada no restablece aiHandled=true. Se valida el turno de nuevo antes de persistirla y antes de autorizar la salida. El bloqueo de la fila Conversation serializa esa autorización con UPDATEs de toma de control, respuesta manual y escalamiento entre procesos.

El transporte ya tenía timeout de 5 segundos; la transacción de admisión final está acotada a 15 segundos. Si el operador tomó control primero, no se llama al transporte automático. Si el envío fue admitido primero, la toma de control espera a que termine esa admisión y luego prevalece. No se promete retirar mensajes que un proveedor ya aceptó.

El marcador `dispatching` queda confirmado en BD antes de enviar. Si hay caída entre aceptación externa y confirmación local, recuperación consulta el estado conocido y evita reenviar; si no puede confirmar, exige revisión humana. Esta elección privilegia evitar duplicados sobre reintentar un envío ambiguo.

## 4. Evidencia de pruebas

**Entorno:** Node v24.19.0, Next 16.3.5, Prisma 6.19.3, PostgreSQL local en contenedor exclusivo `reymen-ai-phase0-tests`, puerto loopback 55432. Bases sintéticas separadas `reymen_ai_phase0_test` y `reymen_ai_phase0_e2e`. Se aplicaron las **77 migraciones existentes únicamente a esas bases nuevas**; no se generaron ni modificaron migraciones. Los proveedores/conectores se simularon o deshabilitaron. Los fixtures se crean y limpian solo en esas bases.

| Comprobación | Resultado final |
|---|---|
| Matriz RBAC/tenant y regresión focalizada | 74/74 en seis archivos focalizados; cubiertos también por la suite completa final |
| Suite completa Vitest | 186/186 archivos, **1260/1260 pruebas aprobadas**, 320.30 s, un worker y timeout de 15 s |
| ESLint | Aprobado: 0 errores; 52 advertencias preexistentes |
| TypeScript | Aprobado: npx tsc --noEmit --incremental false |
| Compilación producción local | Aprobada: npm run build; 106 páginas estáticas generadas |
| Chromium, interfaz actual y cron | 9/9 aprobadas en Chromium (18.2 s): Rulebook, inbox, envío manual, toma/devolución de control y autenticación del cron |
| Diff/ámbito de archivos | Sin errores de whitespace; sin cambios en prisma/, dependencias, deploy/ ni n8n/ |

Casos comprobados: denegación directa sin writes, módulo inactivo, IDs/cursor/borrador de otro tenant; mismo contacto en distintos canales, alias/nulls y escalamiento; cinco ingresos simultáneos deduplicados; tres workers disputando un turno; fallo del proveedor, envío incierto, interrupción en generating/dispatching, tercer lease vencido, borrador huérfano legacy, rollback de ingreso si falla persistir trabajo; toma humana/envío manual/OFF/suspensión/nuevo turno durante inferencia; regeneración concurrente y finalización tras descarte; análisis SUGGEST durable y sin replay de efectos inciertos.

Las primeras ejecuciones de la suite completa revelaron parámetros de entorno inadecuados (AI_PROVIDER fijado y N8N_BASE_URL habilitado) e interferencia de pruebas que comparten el cron global. Se contrastaron las dos suites de automatizaciones con una copia del commit base: **19/19 pasan en serie**. No se modificó el código de automatizaciones para resolver esa diferencia de ejecución. Otra corrida tuvo 1259/1260 aprobadas y un timeout de 5 s bajo carga concurrente de build y navegador. La corrida final aisló la carga y usó un timeout de 15 s: todas pasaron, sin cambiar la lógica de automatizaciones. Los resultados de la tabla distinguen esas corridas diagnósticas de la validación final.

La primera corrida E2E encontró una espera que podía capturar otro POST del inbox antes de persistir la respuesta manual. El test ahora identifica el POST por su contenido y espera la persistencia real sin depender del cierre del stream RSC; no se sustituyó la comprobación por una mera burbuja optimista. Cada ejecución usa un correo sintético distinto para no acumular el límite de intentos de login entre corridas; no se relajó la protección de autenticación.

No se probaron proveedores reales, canales externos, VPS, facturación conciliada ni migración de datos productivos. No hay afirmación de validación operacional externa.

## 5. Problemas pendientes

- H03: cuentas distintas dentro del mismo canal aún no tienen un connectionId; requiere el diseño futuro y coordinación con conectores.
- H06: política comercial explícita para escrituras CRM y atomicidad completa de PipelineAiRun/Action/Opportunity siguen pendientes. La recuperación no repite un intento incierto para evitar duplicarlas.
- H07: relevancia, fuentes versionadas, ACL por especialista y RAG no se implementaron.
- H08: conciliación de costos/modelo efectivo, costos desconocidos y snapshots históricos de presupuesto no se implementaron en este alcance.
- H09/H10/H12/H13: métricas originales, textos, carreras de cupos comerciales y diseño/accesibilidad amplios requieren tareas separadas. Solo se hicieron controles de permisos y ajustes de compatibilidad necesarios.
- H11: tokens/scopes/ventanas y firmas del proveedor dentro de n8n requieren validación externa. El secreto de plataforma sigue reservado a servicios confiables; no se cambió contrato.

## 6. Riesgos residuales

- BD o cron indisponibles impiden recuperar hasta su restablecimiento. Una caída permanente no puede resolverse solo con código de aplicación.
- Lotes pequeños pueden acumular cola tras una interrupción prolongada; revisar antigüedad máxima y capacidad antes de un despliegue futuro.
- La serialización de envío mantiene una fila bloqueada durante un transporte acotado; medir contención con tráfico real antes del piloto.
- Alertas por correo conservan la garantía best-effort existente; estado/auditoría y bandeja de escalamiento son la fuente durable.
- La aceptación/delivery del conector externo no es una transacción con PostgreSQL. El resultado ambiguo requiere revisión, sin prometer exactly-once externo.
- CI usa Node22; esta validación local usa Node24. No se cambió el toolchain del repositorio; ejecutar CI antes de considerar integración.

## 7. Compatibilidad

Se preservan nombres, reglas, artículos, etiquetas, IDs de Conversation/Message, Lead compartido, modos y límites comerciales, rutas y firmas de canal, historial, reservas/presupuestos y operaciones POS/Loyalty. No se introducen Mark/Alex, marketplace, grants multiagente ni navegación nueva.

Cambios intencionales: acciones antes permitidas por error ahora se deniegan; email/enquiry ya no mezclan hilos; ID explícito incompatible falla; callbacks no activan IA sobre una conversación ya tomada; cron devuelve dos resúmenes aditivos y procesa trabajos internos con su runner específico. No desplegar commits intermedios por separado: admisión y recuperación forman una unidad funcional.

## 8. Instrucciones de validación

1. Revisar rama y diff desde `6fd1ef6`; confirmar que `prisma/`, dependencias, `deploy/` y conectores no tienen cambios.
2. Proveer **una BD desechable** en loopback, con nombre inequívoco de prueba. Definir `PHASE0_TEST_DATABASE_URL`; no usar URL de producción ni la base habitual de desarrollo. Aplicar solo las migraciones existentes a la base vacía.
3. Ejecutar comprobaciones con proveedores externos deshabilitados y variables usadas por las suites libres para sus mocks:

```bash
TEST_DATABASE_URL="$PHASE0_TEST_DATABASE_URL" DATABASE_URL="$PHASE0_TEST_DATABASE_URL" \
  env -u AI_PROVIDER -u AI_DRAFT_PROVIDER -u N8N_BASE_URL npm test -- --maxWorkers=1 --testTimeout=15000
npm run lint
npx tsc --noEmit --incremental false
DATABASE_URL="$PHASE0_TEST_DATABASE_URL" npm run build
```

4. Para E2E: BD desechable separada, app local en 3300 y Chromium instalado. Las pruebas seleccionadas crean sus usuarios sintéticos, sin seed productivo. Ejecutar Rulebook, inbox, respuesta manual/control humano y autenticación del cron.
5. En un futuro staging autorizado: verificar cron autenticado, trabajos PENDING/PROCESSING/FAILED, pendientes antiguos, alertas y takeover concurrente. No conectar destinatarios reales ni cambiar credenciales por seguir estas instrucciones.

## 9. Rollback

Este trabajo no está desplegado. No hay migración de esquema que revertir.

Si se desplegara en una etapa posterior autorizada: detener nuevas admisiones de trabajo, conciliar mensajes `dispatching` y análisis inciertos, y pausar ejecución automática antes de revertir. Volver al código anterior después de revisar pendientes; conservar filas internas, mensajes, borradores y auditoría. No restaurar una BD antigua encima de ventas o conversaciones nuevas.

Una versión anterior no entiende los jobs `source=ai-center`; el reintento genérico podría tratarlos como desconocidos. Por ello no basta un rollback ciego de imagen: conservar el runner compatible de recuperación/exclusión hasta drenar o clasificar pendientes. Los registros se conservan para revisión. Los mensajes ya entregados no pueden deshacerse desde una reversión de código.

Las correcciones de permisos deberían mantenerse durante cualquier rollback de recuperación/canales; no reabrir H01 para regresar una pantalla.

## 10. Recomendación para Fase 1

No iniciarla automáticamente. Primero revisar este cambio, ejecutar CI en Node22 y validar en staging autorizado el cron, las alertas y el límite de bloqueo; resolver o aceptar explícitamente los riesgos de costo, efectos CRM e identidad de cuenta. Después solicitar autorización concreta para modelo de agentes/compatibilidad. No se implementó ni se comenzó esa fase.

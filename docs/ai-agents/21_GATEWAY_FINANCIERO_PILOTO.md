# 21 — Gateway financiero del piloto privado

Fecha: 21 de octubre de 2026. Rama dedicada: `codex/mark-pilot-gateway-ledger`, sobre main después de PR #124. Continúa la autorización de preparar el piloto privado con Anthropic y límites de **$25 MXN diarios, $500 por ciclo mensual y $1 por turno raíz**. El staging se prepara por separado en [PR #125](https://github.com/ReymenSolutions/ReymenApp/pull/125).

## Resultado y límites

Se conecta la reserva raíz a una ruta financiera interna del gateway con atribución a instancia/revisión/paso, admisión durable, cierre atómico y conciliación administrativa de resultados inciertos. Se añade un transporte exclusivo de Anthropic, desactivado por defecto. No se conecta todavía el motor de Mark, la interfaz, conocimiento, CRM ni Website Chat a ese transporte. El laboratorio actual sigue usando fixtures y no se convierte en una prueba facturable.

No se aplican migraciones ni cambios de configuración en el VPS o producción, no se piden claves en el chat y no se modifican conexiones comerciales. No se añade broker, cola, servicio, SDK ni dependencia. Esta entrega avanza AG-006 y no declara completas Fase 8 ni AG-011.

## Archivos y contratos

- [Gateway financiero privado](../../src/lib/ai/pilot/gateway.ts): `runPilotAiCall`, `closePilotRoot`, `reconcilePilotCall`. Funciones internas, sin Server Action ni ruta HTTP pública.
- [Gateway existente](../../src/lib/ai/gateway.ts): exporta esas funciones; rechaza `mark:pilot` por la ruta legacy para evitar saltarse la reserva durable. Las llamadas comerciales conservan su contrato.
- [Presupuesto](../../src/lib/ai/pilot/budget.ts): comparte las comprobaciones y el candado PostgreSQL por organización del presupuesto ya implementado.
- [Transporte Anthropic](../../src/lib/ai/providers/anthropic-pilot.ts): clave exclusiva, URL oficial fija, modelo explícito, máximo 5 segundos, cero reintentos del SDK, sin beta fallback, caché explícita ni logs del SDK. No cambia el adaptador Anthropic comercial.
- [Esquema](../../prisma/schema.prisma) y [migración aditiva](../../prisma/migrations/20261123090000_mark_pilot_gateway/migration.sql): instancia/revisión en la raíz con FK multitenant; paso, estimación y hash de entrada en `AiUsage`; unicidad por raíz/paso y recibo del proveedor. No se crea ninguna instancia, tarifa, política, credencial o conexión. Total: 87 migraciones.
- [.env.example](../../.env.example): flag privado apagado, modelo y clave vacíos. Se exige además `REYMEN_STAGING=true`; la ruta no está habilitada para producción.
- [Pruebas financieras](../../src/lib/ai/pilot/gateway.test.ts) y [transporte](../../src/lib/ai/providers/anthropic-pilot.test.ts), con PostgreSQL sintético y proveedor simulado.

## Admisión y presupuesto

Primero deben existir una política autorizada y una raíz reservada/iniciada con las primitivas de [19](19_BASE_PRESUPUESTO_PILOTO.md). La ruta exige ambos flags financieros, marcador de staging, clave y modelo exclusivos, usuario OWNER/MANAGER vigente con módulo y permisos, organización activa, ventana/ciclo/zona/versión de política válidos y una revisión actual de Mark v1 en estado PAUSED, sin rutas de canal activas. No se reutiliza una instancia legacy como si fuera Mark ni se crea una instancia implícita.

La configuración se vuelve a comprobar en la admisión transaccional. La primera llamada fija la instancia y revisión de la raíz; las siguientes conservan esa atribución. El modelo lo elige el backend mediante `AI_MARK_PILOT_MODEL`, nunca un visitante o salida del modelo. No se toman el modelo, la clave ni la política DEGRADE del asistente comercial.

Se permiten dos llamadas secuenciales, pasos 1 y 2. Una llave de solicitud derivada por backend y el índice único impiden repetir el mismo paso, aunque cambie la pregunta o haya solicitudes concurrentes. Mientras haya una llamada pendiente no se admite la siguiente. El claim se confirma antes del HTTP; una caída después del claim conserva el compromiso y no relanza la llamada.

El límite de entrada es 12000 caracteres en total, hasta ocho mensajes y 512 tokens máximos de salida. La estimación usa los bytes UTF-8 del JSON y una holgura de formato, tarifas no negativas y el mayor costo aplicable de entrada/salida; no reutiliza la heurística comercial de caracteres por token. La tarifa y el tipo de cambio se fijan antes de despachar; moneda o conversión desconocida bloquean la llamada. El monto del paso debe caber tanto en la reserva restante como en el límite raíz descontando el consumo conocido. Si baja el presupuesto global o cambia el ciclo/política, se bloquea un nuevo despacho.

El compromiso global ya es la reserva raíz de $1: no se crea otra `AiBudgetReservation` por paso, para evitar contarlo dos veces. Al recibir uso válido se registra el costo y se recalcula el compromiso restante en la misma transacción, bajo el candado de admisión. El ledger conserva ocho decimales y la reserva restante se redondea hacia arriba a seis; no se libera capacidad por redondear hacia abajo. Al cerrar una raíz sin llamadas pendientes se libera solo la capacidad no usada. Una raíz cerrada no vuelve a iniciarse.

Los límites dependen de que las tarifas configuradas correspondan al servicio contratado. El cálculo previo es conservador para este contrato de texto, sin herramientas, adjuntos ni fallback; no es una garantía contractual de facturación del proveedor. Los excesos comprobados se registran como tales, nunca se recorta el costo real para aparentar cumplir un límite.

## Incertidumbre y conciliación

Un timeout, error HTTP, uso inválido, modelo inesperado, recibo duplicado o fallo al guardar el cierre dejan la llamada **PENDING con costo null**, y conservan la reserva. Si la BD responde, se marca `PROVIDER_OUTCOME_UNCERTAIN`, la raíz pasa a UNCERTAIN y se pausa automáticamente la política del piloto con incremento de versión y auditoría. No se guarda el mensaje crudo del error ni se lo etiqueta como costo cero. Si la BD está caída, quedan el claim PENDING y su reserva durable: la marca y auditoría se posponen, pero el compromiso no caduca.

El estado puede recuperarse por IDs de raíz/uso; no se intenta recuperar la respuesta volviendo a cobrar una llamada. No se almacenan prompts ni respuestas en este ledger. El hash de entrada no constituye anonimización y necesita una política de retención antes de usar datos reales.

La conciliación se permite únicamente a ADMIN/SUPER_ADMIN activo de plataforma, contra un uso PENDING de la organización indicada. Se exige referencia al comprobante revisado, ID del proveedor, modelo servido y tokens normalizados. Se registra la evidencia mínima en AuditLog, sin adjuntar conversaciones ni claves. Es una **revisión administrativa de evidencia externa**, no una comprobación automática contra una API de facturación de Anthropic.

- `PROVIDER_USAGE`: registra los tokens comprobados con su tarifa histórica y FX fijado; el costo sigue siendo **ESTIMATED**, no se finge conciliación monetaria de factura. Puede registrar otro modelo servido solo con tarifa histórica y misma moneda; sin tarifa o conversión histórica suficiente conserva la reserva.
- `PROVIDER_NO_CHARGE`: exige confirmación externa de no cobro, resultado FAILED y todos los tokens en cero. Solo entonces registra costo cero confirmado. Un timeout por sí solo no sirve como evidencia de no cobro.

Los importes que excedan la reserva requieren esa revisión administrativa; se registran completos y con `PILOT_COST_OVERRUN`. El control de presupuesto contabiliza el exceso y la política permanece pausada. Cambiar la política para reanudar exige una decisión administrativa explícita después de investigar, con la versión actual; no se reactiva automáticamente tras conciliar.

Conciliar dos veces el mismo uso no produce un segundo cargo ni auditoría: la segunda operación se rechaza porque ya no está pendiente. La raíz puede cerrarse posteriormente por su operador autorizado o un administrador de plataforma, incluso con flags apagados. Ninguna ruta de cierre permite liberar llamadas PENDING. No hay borrado, TTL, reset ni tarea que convierta la incertidumbre en una operación gratuita.

## Evidencia de pruebas

La validación financiera final aprobó **53/53** casos entre cuotas piloto, presupuesto general, gateways, cierre atómico y transporte. Cubre concurrencia de pasos, cuotas restantes, tenant/actor ajenos, revocación de rol/módulo, flags apagados, restricción a staging, tarifa/FX ausentes, snapshots, rechazos facturables, uso inválido, recibos repetidos, fallos de persistencia, conciliación administrativa, modelo servido/moneda y sobrecostos. Incluye la pausa automática y el caso de registros FAILED preexistentes sin costo conocido.

| Comprobación local | Resultado |
| --- | --- |
| Suite general | 214 archivos / 1516 pruebas aprobadas antes de añadir el último caso de FAILED/costo desconocido |
| Financiera final | 6 archivos / 53 pruebas aprobadas, incluido ese caso y las aserciones finales de staging, estado PAUSED, tarifa y moneda |
| TypeScript y build de producción | Correctos |
| Lint completo | 0 errores; 51 advertencias existentes |
| Esquema | 87 migraciones desde cero; diff Prisma vacío |

La suite local general no se anuncia como 1517/1517: la última prueba se validó en la corrida financiera posterior. El CI debe ejecutar el conjunto exacto del commit publicado antes de integrar. No se hicieron pruebas pagadas ni se cambió el servidor del usuario.

Las 87 migraciones se aplicaron sobre una base local nueva; Prisma informó comparación de esquema vacía. Las primeras corridas focales fallaron por falta de acceso al socket local y luego por un dato incorrecto en la creación del fixture anidado; se corrigieron permisos de ejecución local y el fixture, sin relajar aserciones. No se presenta ninguna llamada simulada como evidencia de costos o calidad reales de Anthropic.

Comandos reproducibles, exclusivamente con una base desechable y proveedores simulados:

```bash
npx prisma migrate deploy
npx prisma generate
npx vitest run src/lib/ai/pilot src/lib/ai/providers/anthropic-pilot.test.ts src/lib/ai/budget.test.ts src/lib/ai/gateway.test.ts src/lib/ai/gateway-settlement.test.ts --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000
npm test -- --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000
npm run typecheck
npm run lint
npm run build
```

## Compatibilidad, pendientes y validación de staging

El staging ya permitió login de administrador/OWNER y tres pruebas manuales del sandbox: horario ficticio, solicitud de humano y bloqueo al quitar permiso de consulta. Eso valida el modo simulado; no demuestra conexión real al proveedor ni aceptación del piloto completo.

Esta rama no incluye ni modifica el despliegue de PR #125. Su smoke test pasó; una regresión legacy detectó que el fixture de tema oscuro de Lealtad evitaba la invalidación de caché de preferencias y un selector de clientes coincidía con SSR oculto. Las correcciones de preparación/selectores se publicaron por separado en ese PR, sin cambios a UI ni aserciones comerciales. Exigir sus checks finales; no se mezclan aquí.

Permanecen pendientes:

1. Resolver/verificar la regresión legacy antes de fusionar los PR que la requieren. Exigir todos los controles del commit final, no solo las 52 focales.
2. UI/acciones administrativas y registro revisado de una instancia privada de Mark. No crear filas a mano en una base real para saltarse los gates actuales.
3. Driver de Mark que use esta ruta y conocimiento publicado/autorizado; lectura de CRM con identidad verificada; coordinación de turnos, control humano y emisor único. El gateway no autoriza envíos.
4. Verificar modelo disponible, precios y credenciales de Anthropic; corpus de calidad y evaluación de latencia/costos con revisión humana. No se ha enviado ninguna llamada pagada.
5. Conciliación monetaria de facturas/cargos/monedas diferentes y recuperación operativa asistida de claims PENDING. La conciliación interna implementada todavía no tiene interfaz ni consulta automática al proveedor.
6. La ruta comercial legacy aún registra errores como FAILED/0 y sus reservas tienen TTL; se conserva ese comportamiento en esta rama. La ruta nueva se restringe a staging con clave propia y sin conexiones comerciales, por lo que no se presenta como corrección global de la contabilidad comercial.

Antes de una prueba pagada hacen falta los puntos anteriores que afecten admisión, atribución, operación y seguridad del flujo. No añadir la clave al staging actual, abrir su red interna ni cambiar flags como sustituto de implementar el driver y la revisión humana.

## Rollback

Apagar `AI_MARK_PILOT_GATEWAY_ENABLED` y la política por organización detiene nuevas admisiones. Mantener tablas, ledger, recibos y el cálculo de compromisos. Los resultados ya admitidos se contabilizan aunque se apaguen flags; la autorización de entrega debe verificarse aparte cuando se conecten conversaciones. Resolver usos PENDING con evidencia y cerrar las raíces por las funciones autorizadas, sin borrar obligaciones. No hacer down/drop/reset ni instalar un binario que ignore reservas aún abiertas.

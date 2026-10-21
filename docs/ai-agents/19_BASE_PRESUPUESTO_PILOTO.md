# 19 — Base de presupuesto del piloto privado de Mark

Fecha: 21 de octubre de 2026. Rama: `codex/mark-pilot-budget-25mxn`, publicada en [PR #124](https://github.com/ReymenSolutions/ReymenApp/pull/124). Su dependencia [PR #123](https://github.com/ReymenSolutions/ReymenApp/pull/123) se integró en main como `e99781e`, por autorización expresa del propietario. Autorización: continuar las propuestas de 18 con **$25 MXN diarios**, conservando $500 mensuales y $1 por turno raíz.

## Resultado de este incremento

Se implementa la admisión financiera de turnos del piloto privado, con reservas durables, límites concurrentes y aislamiento. Es un primer incremento de AG-006/Fase 8, **no la Fase 8 completa ni Mark con proveedor**. No activa canales ni llama a una IA. El sandbox de Fase 5 sigue usando fixtures sin consumo.

Las cuotas son por organización para el piloto `mark:pilot`; no se aplican automáticamente a cada cliente comercial. Una política explícita y el flag `AI_MARK_PILOT_BUDGET_ENABLED=true` permiten reservar, pero no activan inferencia ni una instancia. Los defaults/techos son $25 diarios, $500 por ciclo mensual del negocio y $1 por raíz. Las restricciones SQL impiden superar estos techos configurando la tabla.

## Implementación

- [Servicio](../../src/lib/ai/pilot/budget.ts): configuración opt-in por administrador activo de plataforma con control de versión/auditoría; admisión por OWNER/MANAGER autorizado del negocio, claim único de raíz y cancelación segura de reservas sin despacho.
- [Presupuesto existente](../../src/lib/ai/budget.ts): comparte el mismo candado PostgreSQL por organización y contabiliza las reservas piloto pendientes junto con las llamadas legacy. Exporta el cálculo decimal interno para evitar decisiones de cupo con números flotantes.
- [Esquema](../../prisma/schema.prisma) y [migración aditiva](../../prisma/migrations/20261122090000_mark_pilot_budget/migration.sql): `AiPilotBudgetPolicy`, `AiPilotBudgetRoot` y referencia opcional multitenant desde el ledger existente `AiUsage.pilotRootId`.
- [Restricciones SQL](../../prisma/migrations/20261122091000_mark_pilot_budget_checks/migration.sql): cuotas máximas, reservas no negativas, estados consistentes, ventanas válidas e índice del ledger por raíz. Se conservan las 84 migraciones anteriores; total 86.
- [Traducciones](../../src/lib/server-messages.ts), [.env.example](../../.env.example), [pruebas](../../src/lib/ai/pilot/budget.test.ts) y [limpieza de fixtures](../../src/test/helpers.ts). No se modifican registros reales, planes, claves ni configuraciones del servidor.

## Reglas financieras

La admisión reserva el límite completo de la raíz antes de permitir su claim. La suma de gasto del ledger más reservas abiertas no puede superar cuota diaria, mensual ni el saldo global de la organización. Esta reserva es conservadora: puede negar un turno que habría gastado menos de $1. No usa el margen DEGRADE como ampliación del cupo del piloto.

Las reservas pendientes se suman también al presupuesto global, incluso con el flag piloto o la política apagados. Así las llamadas legacy no consumen dinero comprometido. Mantener el flag apagado no borra obligaciones financieras; a diferencia del sandbox ficticio, esta tabla se consulta para calcular el presupuesto. Aplicar ambas migraciones antes de instalar este código.

Cada día sigue la zona IANA del negocio, incluyendo días de 23/25 horas por DST. El ciclo mensual reutiliza el ancla existente. Cada raíz conserva zona, ventanas, versión de política y cupo; si vence el día/ciclo o cambia zona/política, no se despacha. No se ejecutan resets ni borrados de filas al llegar la medianoche.

La requestKey queda acotada a organización/operador y es idempotente: una raíz cerrada no revive. El claim RESERVED→IN_FLIGHT ocurre una sola vez. Cancelar libera únicamente una raíz RESERVED sin llamadas de ledger asociadas. IN_FLIGHT/UNCERTAIN mantienen su reserva sin TTL, aunque cambie el día/ciclo o se apague el piloto. No hay un job que trate un timeout como gasto gratuito ni reintente la operación.

Se conserva un solo ledger, con referencia opcional a raíz protegida por FK de organización. La tabla de raíces registra compromisos, no una segunda contabilidad de tokens/costos. No se guardan preguntas, respuestas ni datos del CRM en este incremento.

## Pruebas

Validación focal: **34/34** entre piloto, presupuesto, gateway y cierre atómico. Los 13 casos nuevos de cuotas cubren 26 admisiones simultáneas (solo 25 aceptadas), carrera contra reserva legacy bajo el mismo lock, idempotencia, tope global/mensual/diario, constraints SQL, actores/organizaciones ajenos, rol/módulo revocados, admin inactivo, rollback conservando compromisos, no duplicar claim, caducidad/cambio de política/zona y DST de 23/25 horas.

La primera corrida completa se detuvo al fallar la prueba de concurrencia existente del presupuesto. Una prueba determinista adicional confirmó un defecto previo: ante fallo al liberar la reserva, el ledger ya había quedado SUCCEEDED. Se modificó [gateway](../../src/lib/ai/gateway.ts) para confirmar gasto y liberar reserva en una transacción con el mismo lock de admisión. La [prueba de regresión](../../src/lib/ai/gateway-settlement.test.ts) falló antes de la corrección (SUCCEEDED en vez de PENDING) y pasó después; las 34 focales pasaron con el cambio. No se relajaron límites ni aserciones.

| Evidencia final | Resultado observado |
| --- | --- |
| Migración local | 86 migraciones desde cero; comparación Prisma vacía |
| Financiera focal | 34/34 aprobadas después de la corrección de atomicidad |
| Suite local de 212 archivos | 211 aprobados; 1497 pruebas aprobadas y 1 fallo de traducciones en el código previo a `91200ae` |
| Corrección de traducciones | Los cinco mensajes se tradujeron en `91200ae`; las 5 pruebas de UserError pasaron después |
| TypeScript y build | Correctos tras la corrección financiera |
| Lint | 0 errores; 51 advertencias existentes |
| CI Node 22 | Consultar los checks finales de [PR #124](https://github.com/ReymenSolutions/ReymenApp/pull/124); exigir toda la suite y los tres escenarios E2E en verde antes de fusionar |

El único fallo de la suite local final fue la comprobación de traducciones iniciada antes de esa corrección; no fallaron las pruebas financieras. No se presenta esa corrida como 1498/1498 local. El CI de la versión corregida verifica el conjunto exacto. El propietario autorizó fusionar los PR listos; #124 se redirige a main después de #123 y solo se fusiona con los controles finales aprobados. No se ejecuta el despliegue del VPS.

## Compatibilidad, validación y rollback

La admisión no tiene acción pública ni UI: son primitivas internas que la futura integración debe llamar antes del proveedor. Las funciones existentes mantienen sus contratos; el presupuesto global suma un compromiso adicional solo si existen raíces piloto pendientes. El gateway legacy recibe únicamente la corrección de atomicidad descrita arriba; no se cambia su proveedor, la política de tokens/fallback, el contacto con clientes ni el procesamiento POS/Lealtad.

Para validar en una BD local desechable: aplicar las 86 migraciones, generar Prisma, habilitar el flag únicamente para fixtures y ejecutar `src/lib/ai/pilot/budget.test.ts`, presupuesto/gateway y suite completa. Una cuenta ADMIN puede configurar la política; una sesión de negocio con permiso de gestionar conocimiento puede reservar/iniciar una raíz. Cambiar el flag no configura un proveedor ni envía una respuesta.

La corrección de atomicidad del gateway se mantiene al apagar el flag; no altera cómo se calcula una tarifa ni resuelve los costos desconocidos del proveedor.

Rollback preferido: apagar el flag y la política para detener admisiones; conservar las tablas, FK, recibos y cálculo de compromisos. Las raíces no despachadas pueden cancelarse con autoridad vigente, incluso con el flag apagado. No hacer drop/down, resets ni eliminar reservas para recuperar saldo. No volver a un binario que desconozca estas reservas si existen compromisos abiertos: primero reconciliarlos.

## Gates que siguen pendientes antes de inferencia real

1. Integrar el gateway a la raíz, agregar claims durables por paso y atribución por instancia/versión/ciclo. El nuevo FK no significa que el gateway lo esté escribiendo todavía.
2. Implementar cierre/conciliación autorizada a partir de evidencia del ledger/proveedor. Este incremento conserva IN_FLIGHT ante incertidumbre; no ofrece liberación manual arbitraria ni cierre automático de llamadas.
3. Fijar tarifa/modelo servido y estimación conservadora del contexto; controlar reintentos/fallback del SDK y el proveedor. El SDK legacy tiene políticas propias que no deben heredarse silenciosamente a las dos llamadas acotadas de Mark.
4. Corregir la contabilidad de resultado desconocido del gateway legacy antes de usarlo para el piloto real; esta admisión no reetiqueta su historial ni modifica sus fallos existentes. Una reserva no demuestra un costo de factura.
5. Conectar conocimiento publicado y CRM con identidad verificada, turno/control humano y emisor único; luego evaluar calidad, costos y canal privado según [18](18_PUBLICACION_Y_PILOTO_RECOMENDADO.md).

Sin estos gates no se presenta el tope como una garantía de facturación del proveedor, ni se habilita Mark real. No se ha elegido un negocio productivo para aplicarlo ni se ha ejecutado el comando del VPS.

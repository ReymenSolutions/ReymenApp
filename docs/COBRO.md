# Cobro, gracia y planes personalizados

## Política de acceso

- `Organization.billingPeriodEnd` es la fecha pagada hasta. Nulo significa que la organización todavía no está incorporada al cobro: no se suspende por mora.
- Se conceden **72 horas de gracia** desde esa fecha. Al llegar exactamente al límite, se bloquea el acceso a módulos en servidor y se dirige al usuario a Configuración. Facturación y Solicitudes/soporte conservan sus permisos habituales.
- Los avisos muestran fecha y hora exactas en **UTC**, explícitamente indicada. También aparece en Mi suscripción.
- No se borra información, no se desactiva la organización y no se reescriben los módulos contratados. Un pago confirmado que cubra el periodo vigente elimina la restricción por mora. Una suspensión administrativa de un módulo se conserva.
- Se mantienen la recepción firmada de ventas, cajas y cocina del POS, los historiales y su conciliación. Este cambio no apaga una terminal POS ni detiene ventas locales; bloquea el acceso a módulos en ReymenApp y nuevas ejecuciones/llamadas IA. No configura remotamente n8n o SmartCard: las ejecuciones externas deben respetar el contrato de admisión existente.
- Al cancelar la suscripción Stripe se conserva el contrato y el periodo ya pagado; el acceso vence con la misma gracia. Cancelar no equivale a borrar o cambiar a Starter.

## Pagos

Cada `BillingPayment` se agrega con una referencia única por organización. El bloqueo de fila serializa pagos concurrentes y reintentos. Una transferencia registrada por administración recorre meses de calendario; una factura de suscripción pagada utiliza el periodo de su línea recurrente. Un pago antiguo nunca acorta lo ya pagado.

**Solo `invoice.paid` amplía la vigencia de Stripe.** `customer.subscription.updated`, aunque diga `active`, no prueba que la renovación se haya pagado. Una factura independiente de implementación no amplía la suscripción. El webhook valida cliente, suscripción y pertenencia del precio personalizado; no concede módulos por suscripciones incompletas.

## Precio pactado y Stripe

1. Administración guarda el precio mensual en **A la medida** o **Cambiar plan → Precio mensual pactado**.
2. Al contratar, el servidor crea y conserva un precio Stripe mensual en MXN asociado exclusivamente a esa organización (`StripeContractPrice`). El navegador no decide el importe. Checkout usa ese precio, no el precio del plan base.
3. Si ya hay una suscripción compatible, guardar intenta sincronizar el importe. Se mantiene la fecha de renovación y `proration_behavior=none`: **el importe nuevo se cobra en la siguiente renovación**, sin diferencias del periodo actual.
4. La tarifa guardada es el estado deseado durable. El cron reintenta si hay fallo de red; compara primero la tarifa Stripe para no repetir cambios ya aplicados. El resultado `contracts.pending` y los registros del cron permiten detectar pendientes. El diálogo advierte cuando la sincronización inmediata quedó pendiente.
5. Quitar A la medida devuelve el precio de catálogo en la próxima renovación si existe un precio Stripe válido. Un precio ausente/incompatible deja pendiente la sincronización y exige corregir la configuración; no se inventa un importe.

La sincronización automática admite una única línea mensual MXN con cantidad uno. Las suscripciones con schedules, múltiples líneas u otra periodicidad requieren revisión; no se reescriben. Descuentos/impuestos ya configurados en Stripe siguen aplicando al importe base. La factura ya emitida no se recalcula. Cambiar justo después de que Stripe emita la renovación afecta la siguiente factura aún no emitida.

No se deben intercambiar claves test/live sobre la misma base: clientes, precios y suscripciones pertenecen a su cuenta y modo Stripe. La transición a cobros reales requiere configuración independiente y validación explícita.

## Implementación primero, mensualidad después

Recomendación comercial: separar ambos conceptos.

- **Implementación:** cargo único (por ejemplo $3,000 MXN), cobrado con una factura o Payment Link de Stripe de pago único.
- **Suscripción:** precio recurrente pactado (por ejemplo $500 MXN/mes), contratado cuando se entregue/active el servicio. La fecha de ese inicio determina sus renovaciones.
- Si ambos comienzan el mismo día, Stripe permite una primera factura con cargo único más mensualidad; el cargo único no debe convertirse en precio recurrente.
- Si el comienzo será posterior y se conoce la fecha, Stripe puede programarlo mediante schedules/trial. Esa configuración no está automatizada por este cambio; las suscripciones con schedules requieren revisión y no pasan por el sincronizador automático.

El panel de Reymen aún no crea cargos únicos de implementación ni administra hitos de entrega. Este cambio evita confundir su pago con la mensualidad. No registrar una implementación como pago mensual desde Admin, pues esa acción sí extiende acceso.

## Avisos y reintentos

Avisos a responsables activos: 7, 3 y 1 días antes; al vencer; al finalizar la gracia. Incluyen fecha exacta de suspensión, conservación de datos y acceso a facturación/soporte. Stripe activo también recibe recordatorio, indicando que se intentará el cargo automático.

`POST /api/cron/billing` requiere `CRON_SECRET`. El cron se instala cada 15 minutos. La suspensión se calcula al acceder: no depende de que el cron esté puntual. El correo necesita `RESEND_API_KEY`; no se considera enviado si el proveedor falta o devuelve error.

`BillingNotice` conserva intentos, próxima oportunidad y fecha de envío. Hay hasta cinco intentos, con separación mínima de 15 minutos y reserva atómica para trabajadores concurrentes. Los correos anteriores a esta migración se conservan como enviados para evitar reenvíos masivos. Un fallo después de que el proveedor acepte el correo pero antes de guardar la confirmación puede producir un correo repetido; no se promete entrega exactamente una vez. Si se agotan intentos, revisar proveedor y registros antes de reabrir un aviso manualmente.

## Actualización y validación

La migración `20261208090000_billing_grace_contracts` es aditiva. **Antes de desplegar revisar los vencimientos existentes:** una organización con más de tres días de atraso quedará restringida inmediatamente; nulo queda exento. Respaldar la base. El script `deploy/update.sh` respalda antes de aplicar migraciones pendientes.

Después de fusionar el cambio en main, en Termius:

```bash
sudo bash /home/emilianorm/reymen-ai-ops-preview/deploy/update.sh && sudo bash /home/emilianorm/reymen-ai-ops-preview/deploy/install-cron.sh
```

El instalador conserva el programa de backups y reemplaza el archivo cron gestionado por Reymen; revisar personalizaciones locales antes de usarlo. Comprobar `contracts.pending=0` y envíos en `/var/log/reymen/cron.log`. No imprimir secretos.

En Stripe **test** verificar: checkout de precio pactado, renovación fallida, 72 horas de gracia, acceso a facturación/soporte, pago confirmado/reactivación, edición de importe sin factura/prorrateo inmediato, renovación con importe nuevo y factura de implementación sin ampliación de vigencia. Un Test Clock de Stripe no mueve el reloj del VPS; para probar mora usar una organización sintética con vencimiento controlado.

Rollback: volver a la imagen/commit anterior conservando las columnas/tablas aditivas, sin borrar pagos ni contratos. La reversión de código no revierte los precios ya sincronizados en Stripe; revisar las suscripciones afectadas y restaurar el precio anterior sin prorrateo si corresponde. Mantener webhooks y registrar cualquier pago recibido durante el rollback.

## Evidencia local de validación (2026-11-09)

- Migración aplicada únicamente a PostgreSQL local desechable; Prisma generado correctamente.
- Pruebas dirigidas: 71 aprobadas (gracia exacta, datos/permisos preservados, pagos concurrentes, precios por organización, reintentos, IA y ventas POS). Después se agregó el caso de renovación con módulo suspendido: 15 pruebas finales de webhook/contratos aprobadas. Traducciones: 5 aprobadas.
- Compilación de producción y TypeScript aprobados. ESLint: cero errores, 64 advertencias preexistentes.
- Playwright sobre la compilación de producción: 3 recorridos aprobados, incluyendo alta comercial, aislamiento de módulos y suspensión → facturación/soporte → pago → recuperación del módulo.
- La primera suite general tuvo 1829 éxitos y 7 fallos: traducciones, identificador reutilizado en un fixture y timeouts concurrentes bajo compilación. Se corrigieron los dos primeros y se repitieron exitosamente todos los casos afectados sin esa carga. El resultado de CI sobre el commit publicado es la referencia para la regresión completa.
- Proveedor Stripe simulado en pruebas automatizadas; no se usaron claves del VPS ni se efectuaron cobros. Queda la aceptación externa en Stripe test con el precio personalizado y la renovación sin prorrateo, y confirmar entrega de correo en el VPS.

CI sobre la integración con `main` aprobó 268 archivos y 1846 pruebas unitarias/integración, además de compilación y cuatro grupos de navegador. El grupo restante detectó una importación dinámica incompatible en el propio test y una alta de plan por SQL que omitía invalidar caché. El recorrido se cambió a crear el plan y registrar el pago mediante la interfaz administrativa; los tres casos pasan localmente en 31.3 segundos. CI vuelve a validar ese ajuste de pruebas; no cambió el código de producción para resolverlo.

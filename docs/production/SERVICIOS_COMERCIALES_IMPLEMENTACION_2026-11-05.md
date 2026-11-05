# Servicios independientes: implementación y validación

Fecha: 2026-11-05. Rama: `codex/service-offerings-validation-20261104`.
Complementa la auditoría histórica `VENTA_SERVICIOS_INDEPENDIENTES_2026-11-04.md`.

## Reglas aprobadas

- Solo se contabilizan ejecuciones exitosas. Simulaciones y reintentos del mismo trabajo no consumen otra ejecución.
- Cuota mensual sin excedentes automáticos. El mes se determina en UTC al admitir el trabajo.
- Citas requiere CRM. Reportes requiere CRM, Automatizaciones, Agente IA, Foods o Lealtad.
- No se borra información al retirar módulos. Las excepciones administrativas se conservan al cambiar de paquete.

## Cambios

1. `plan-entitlements.ts`, acciones de clientes y webhook Stripe: asignación del plan y módulos contratados en una transacción. Se suspenden los módulos que salen del paquete; se preservan concesiones/restricciones administrativas. Las antiguas concesiones con nota «Plan A la medida» se reconocen como parte del paquete. Los eventos Stripe conservan los módulos de un plan a la medida; bloquean la fila de organización para no competir con su edición.
2. Altas administrativas pueden elegir un plan activo. Checkout usa el catálogo y verifica precio activo, moneda MXN, periodicidad mensual e importe. Precio desconocido, cliente Stripe ajeno o suscripción incompleta no conceden productos. Los precios pactados mantienen contratación asistida.
3. Creación, instalación de plantillas y reactivación de automatizaciones respetan capacidad incluso desde administración. Se distinguen automatizaciones instaladas de ejecuciones mensuales.
4. `AutomationUsage`, `automation/usage.ts`: admisión serializada por organización, reserva durable por ejecución y resultado final idempotente. Cuotas propias de planes a la medida. `null` significa ilimitado y `0` bloquea nuevas ejecuciones; no se inventa una cuota para los clientes existentes.
5. Despachador/callback: reservas previas, confirmación de éxito y liberación por fallo definitivo. Un callback temprano no puede ser sobrescrito por el despachador. Un timeout conserva reserva, sin contabilizar éxito. Se puede recibir confirmación tardía.
6. `/api/v1/automations/runs`: contrato de admisión y cierre para flujos externos, autenticado con el secreto de la automatización y aislado por su organización.
7. Menú y autorización de Citas/Reportes conforme a contratación. La restricción se aplica en servidor, además de ocultar enlaces.
8. Administración de automatizaciones: operación antes del catálogo, búsqueda, filtros de cliente/estado, paginación de 20 filas, tarjetas móviles y resumen de éxitos/reservas del mes. El catálogo queda plegable.

## Límites y trabajo externo pendiente

- **No está certificada la operación comercial completa en producción.** Stripe y n8n no tienen credenciales sandbox disponibles en esta sesión. Las pruebas de integración externas usan dobles; el navegador comprueba el recorrido local.
- Los flujos n8n existentes no adquieren cuota automáticamente: deben llamar a admisión antes de efectos externos y confirmar después. Una respuesta distinta de admisión positiva debe detener el flujo. No afirmar control total de cuota hasta adaptar y probar cada flujo contratado.
- Un resultado incierto conserva reserva hasta conciliación. No liberarla solo por tiempo: podría haber ejecutado el efecto externo. No se añadió interfaz de conciliación automática.
- Cada flujo debe deduplicar sus efectos por identificador durable de ejecución. La unicidad del consumo no garantiza por sí sola que un tercero no envíe dos mensajes.
- El checkout de precio pactado y los excedentes siguen deshabilitados. No se implementa suspensión comercial por mora.
- Editar la composición del catálogo no migra masivamente todas las organizaciones existentes: la conciliación se aplica al asignar/cambiar plan, volver desde A la medida o recibir provisión Stripe válida. La operación manual aditiva de sincronización sigue disponible.
- No se modifica POS, Foods ni Lealtad en este cambio. No se cambia infraestructura de producción.

## Validación y aceptación

Base PostgreSQL local desechable `reymen_commercial_final`, datos sintéticos, sin conexión a producción. Todas las migraciones se aplicaron desde cero.

- Suite completa: 259 archivos, 1,791 pruebas aprobadas y 3 fallos iniciales: dos fixtures compartían el mismo ID Stripe y una prueba de concurrencia de IA excedió 5 segundos. Los fixtures ahora usan IDs diferentes.
- Repetición dirigida con un worker: **58/58 pruebas aprobadas en 9 archivos**, incluyendo los tres casos anteriores, planes a la medida, cuotas, autorización, callback temprano y éxito tardío tras vencimiento. No se aumentó el timeout de producto ni se omitieron pruebas.
- `npm run typecheck`: aprobado. ESLint completo: cero errores; se retiró además un import sin uso introducido por este cambio. Lint de archivos finales modificados: aprobado.
- `npm run build`: aprobado, incluida la verificación TypeScript.
- Playwright contra la aplicación compilada: **2/2 aprobadas** (22.4 s). Alta administrativa con plan, asignación de módulos, filtros, navegación del cliente a 390 px, bloqueo de rutas no contratadas y ausencia de desbordamiento horizontal en Automatizaciones.
- No se ejecutaron conexiones reales de pago ni envíos a clientes.

Para el sandbox externo:
1. Preparar organización de prueba con Automatizaciones, capacidad instalada 1 y cuota mensual 2; configurar Stripe test-mode y n8n sandbox con secretos privados.
2. Comprar un precio mensual MXN que coincida con el catálogo; comprobar webhook, plan, módulos y pago. Repetir el webhook y comprobar que no se duplica el pago.
3. Rechazar checkout sin pago, precio desconocido y organización ajena; no deben conceder módulos.
4. Ejecutar dos trabajos exitosos con IDs distintos; reintentar uno con el mismo ID y comprobar consumo 2. El tercer ID debe recibir rechazo antes de ejecutar efectos externos.
5. Confirmar un fallo definitivo y comprobar liberación; simular timeout y comprobar reserva retenida. Simulaciones no llaman a admisión.
6. Cambiar a un plan de chatbot: Citas/CRM inaccesibles si no están contratados; datos históricos preservados. Validar móvil y escritorio con cuenta de cliente.
7. Solo después de estas comprobaciones y revisión del cambio, programar actualización con respaldo y ventana de observación.

## Despliegue y rollback

Migración aditiva: `20261202090000_automation_usage`. Debe aplicarse antes de iniciar la aplicación nueva. El nombre respeta las migraciones ya presentes hasta diciembre de 2026. No ejecutar las versiones temporales anteriores del archivo de migración.

Antes del despliegue: respaldo verificado, revisión de cuotas del catálogo y contratos externos. No hay comando de actualización de main hasta publicar e integrar este cambio.

Rollback: detener despachos nuevos, volver a la imagen/commit anterior y mantener las columnas y tabla nuevas. **No borrar el registro de consumo ni revertir datos del cliente.** La versión anterior no impone esta cuota; mantener detenidos los flujos afectados hasta resolver o restaurar la versión corregida. Revisar reservas inciertas antes de reanudar.

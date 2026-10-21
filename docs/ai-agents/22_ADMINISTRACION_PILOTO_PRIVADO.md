# Administración del piloto privado de Mark

## Alcance

Incremento sobre el gateway financiero descrito en [21](21_GATEWAY_FINANCIERO_PILOTO.md). Se incorpora `/admin/ai-pilot`, disponible exclusivamente con `REYMEN_STAGING=true` y sesión de administrador de plataforma. No se añade navegación comercial, proveedor activo, envío de mensajes ni acceso al CRM.

Permite seleccionar el negocio de prueba, preparar una instancia pausada de Mark, consultar presupuesto general y compromisos pendientes, pausar admisión, registrar conciliación con comprobante revisado y cerrar turnos con costos conocidos. Las cuotas máximas siguen siendo 25 MXN/día, 500 MXN/ciclo y 1 MXN/turno; también aplica el presupuesto general del negocio.

## Cambios y controles

- `src/lib/ai/pilot/definition.ts`: manifiesto y configuración canónicos privados; hash estable para detectar configuraciones incompatibles.
- `src/lib/ai/pilot/admin.ts`: preparación transaccional e idempotente, locks de catálogo/presupuesto, rol vigente, organización activa y módulo habilitado. Crea política desactivada y revisión inmutable; no sobrescribe configuraciones existentes. Una instancia sin su política se rechaza para revisión, sin reparación silenciosa.
- `src/actions/mark-pilot-admin.ts`: acciones con sesión, validación estricta y autoridad revalidada en base de datos. No acepta identidad del actor enviada por el navegador. Conciliar exige confirmación explícita de revisión de evidencia.
- `src/lib/ai/pilot/gateway.ts`: expone el esquema de evidencia existente y añade cierre exclusivo de plataforma para esta interfaz. Conserva el cierre interno del propietario, pero la acción administrativa no puede recurrir a ese permiso con una sesión de administrador obsoleta.
- `src/app/(admin)/admin/ai-pilot/` y `src/components/admin/PrivateMarkAdmin.tsx`: interfaz ES/EN, carga, vacío, error/reintento, lista de pendientes paginada de diez, reservas acotadas a veinte y diseño móvil. No devuelve credenciales, mensajes, preguntas ni datos de clientes.
- Pruebas unitarias, de integración y navegador; escenario CI privado separado y comprobación de indisponibilidad fuera de staging en la suite legacy.

La conciliación conserva las reglas de 21: un timeout no prueba gratuidad; costo desconocido conserva reserva. El administrador registra consumo o ausencia de cobro verificados externamente. No existe verificación automática de facturas. El consumo por tokens se estima con tarifas históricas y tipo de cambio registrado; no equivale a una factura confirmada. Reconciliar no reactiva automáticamente el piloto.

## Validación

1. Aplicar previamente las migraciones de 21 únicamente a la base sintética de staging. Este incremento no agrega migraciones.
2. Con proveedor simulado y claves vacías, iniciar sesión como superadministrador en staging y abrir `/admin/ai-pilot`.
3. Seleccionar **Reymen Piloto** y preparar Mark. Al recargar debe permanecer preparado, pausado, sin rutas ni uso de IA y con admisión desactivada.
4. Comprobar que un propietario no puede acceder y que fuera de staging la página no está disponible.
5. Validar conciliación con fixtures locales: evidencia incompleta y autoridad revocada deben fallar; un turno de costo desconocido no debe poder cerrarse.
6. Verificar ancho de 320, 390, 768 y 1280 píxeles.

No generar un costo real para fabricar una operación pendiente. Los tests crean únicamente fixtures en una base local desechable.

## Pendientes y compatibilidad

Esta pantalla prepara y administra; no completa la conexión de Mark a Anthropic. Siguen pendientes el driver revisado, lectura del conocimiento autorizado para Mark, identidad verificada del cliente para consultas CRM, integración a conversaciones con revisión humana y validación real de calidad/costos. El laboratorio continúa simulado. No añadir una clave como sustituto de esas conexiones.

No se modifican conectores, canales comerciales, gateway legacy ni datos productivos. No se incorporan dependencias ni brokers. El catálogo de definición `mark` se comparte, pero cada instancia, revisión, reserva, uso y acción queda asociada a su organización. El administrador de plataforma puede consultar negocios distintos deliberadamente; los propietarios no reciben ese acceso.

## Rollback

Detener app/ingress de staging con `bash deploy/staging/run.sh stop`, volver al commit anterior, reconstruir y arrancar. Conservar la base, su volumen, credenciales, registros financieros y auditoría. No ejecutar `down -v`, reset, bootstrap ni borrar reservas. Desactivar las nuevas pruebas no libera compromisos inciertos. Fuera de staging, mantener `REYMEN_STAGING` sin habilitar.

## Evidencia

- Pruebas focales iniciales: 3 archivos, 28 casos aprobados, con PostgreSQL local sintético y proveedor simulado.
- Typecheck y lint de los archivos nuevos: aprobados.
- Build de producción local aprobado con proveedor simulado.
- Chromium local sobre ese build: preparación pausada/idempotente, acceso denegado al propietario y anchos móviles aprobados (2 casos). Panel no encontrado y sin efectos fuera de staging aprobado (1 caso). El caso de entorno contrario se omite expresamente en cada ejecución; CI usa escenarios separados para cubrir ambos.
- Primera regresión completa: 1 fallo y 1527 casos aprobados. El fallo fue la prueba existente de recuperación de clientes (`customer-detectors.test.ts`, se esperaba ejecución PENDING y no se obtuvo ninguna); sus ocho casos pasaron al repetir el archivo aislado. No se modificó ese código ni se ocultó el fallo. La repetición completa y CI deben aprobar antes de fusionar.

No se ha desplegado este incremento en el VPS ni se han realizado llamadas pagadas. No autoriza todavía el piloto productivo.

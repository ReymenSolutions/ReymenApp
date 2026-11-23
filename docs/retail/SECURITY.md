# Seguridad — Reymen Retail

Requisitos de [`SPEC.md`](SPEC.md) § Seguridad, datos y disponibilidad. **Pendientes de implementación y prueba**; esta lista no afirma que Retail ya cumpla estas propiedades.

- **Aislamiento:** toda consulta filtra por `organizationId`; pruebas de que una organización no ve datos de otra.
- **Corte 2 en rama:** `RetailItem`, `RetailTransfer` y `RetailMovement` tienen claves compuestas por organización; PostgreSQL rechaza referencias cruzadas. El servicio revalida actor activo, permiso y entitlement para cada operación. El índice parcial impide dos traslados abiertos de una misma pieza.
- **Acceso:** guard de módulo `RETAIL` + permisos por rol (`src/lib/permissions.ts`). Aprobar descuentos y cancelar ventas: solo dueño o gerente.
- **Costo interno:** nunca sale en la web pública, WhatsApp ni documentos de cliente; pruebas que lo verifican.
- **Bitácora:** quién/cuándo en cada movimiento (`RetailMovement.realizadoPorId`) y acciones sensibles en `logAudit`.
- **Datos personales (LFPDPPP):** Grupo Carvallo es responsable y Reymen encargado. Clientes en el CRM existente; el ambiente de prueba los anonimiza (`prisma/sanitize-test.ts`; agregar ahí las tablas de Retail que tengan datos personales).
- **Pagos:** el POS solo registra método y monto; no se procesan tarjetas ni se guardan sus datos.
- **Solicitudes públicas:** el teléfono declarado por un visitante no prueba identidad. El apartado crea un Lead; la asociación con Customer e historial requiere verificación. Validar origen, datos y frecuencia; usar clave de idempotencia.
- **Fotos:** volumen privado por organización, lectura mediante una ruta autorizada o vista pública seleccionada; validar formato y tamaño, y asegurar respaldo separado (DEC-03).
- **Respaldos:** confirmar el procedimiento real de base y volumen en test antes del piloto; incluir fotos y una prueba de restauración. No inferir cobertura del volumen a partir del respaldo de PostgreSQL.

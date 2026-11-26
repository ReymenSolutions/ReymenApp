# Seguridad — Reymen Retail

Compromisos de SPEC.md § Seguridad, datos y disponibilidad, y cómo se cumplen en el código.

- **Aislamiento:** toda consulta filtra por `organizationId`; pruebas de que una organización no ve datos de otra.
- **Acceso:** guard de módulo `RETAIL` + permisos por rol (`src/lib/permissions.ts`). Aprobar descuentos y cancelar ventas: solo dueño o gerente.
- **Costo interno:** nunca sale en la web pública, WhatsApp ni documentos de cliente; pruebas que lo verifican.
- **Bitácora:** quién/cuándo en cada movimiento (`RetailMovement.realizadoPorId`) y acciones sensibles en `logAudit`.
- **Datos personales (LFPDPPP):** Grupo Carvallo es responsable y Reymen encargado. Clientes en el CRM existente; el ambiente de prueba los anonimiza (`prisma/sanitize-test.ts`; agregar ahí las tablas de Retail que tengan datos personales).
- **Pagos:** el POS solo registra método y monto; no se procesan tarjetas ni se guardan sus datos.
- **Respaldos:** diarios con retención de 30 días (`deploy/backup.sh`); las fotos se respaldan según DEC-03.

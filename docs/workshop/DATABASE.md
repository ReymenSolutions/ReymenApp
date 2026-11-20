# Base de datos

La migración `20261120170000_workshop_foundation` agrega el enum `WORKSHOP`, estados y modelos Workshop. Es aditiva; no modifica datos existentes. Se aplicó exitosamente solo a una base PostgreSQL desechable; no se ha ejecutado en una base real.

Los modelos guardan `organizationId`. Hay índices por organización, folio, vehículo y fecha. El stock se deriva sumando movimientos; `WorkshopPart` no contiene una existencia editable. Una cotización de borrador puede carecer de folio; un flujo futuro deberá asignarlo solo al emitir el PDF con todos los campos requeridos. La orden exige una cotización origen. `costoTotalNeto` y `utilidadNeta` permanecen nulos cuando faltan costos, evitando utilidades ficticias.

Antes de abrir flujos adicionales se deben reforzar y probar todas las referencias cruzadas entre organización, cliente, vehículo, refacción, compra y orden. Las claves foráneas por ID no sustituyen esa validación de tenant.

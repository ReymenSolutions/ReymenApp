# Base de datos

La migración `20261120170000_workshop_foundation` agrega el enum `WORKSHOP`, estados y modelos Workshop. La segunda, `20261120180000_workshop_folio_counter`, agrega contadores de folio, fotos privadas, datos de entrega y llaves de idempotencia de compra/caja. La tercera, `20261123160000_workshop_landing_requests`, agrega `WorkshopLeadRequest` para conservar cada solicitud y sus datos de vehículo ligada a un `Lead` del CRM. La cuarta, `20261123170000_workshop_authorized_lines`, agrega una clave de idempotencia única por organización a `WorkshopOrderItem`. Son aditivas; no modifican registros existentes. Se aplicaron solo a una base PostgreSQL desechable; no se han ejecutado en una base real.

Los modelos guardan `organizationId`. Hay índices por organización, folio, vehículo y fecha. El stock se deriva sumando movimientos; `WorkshopPart` no contiene una existencia editable. Una cotización de borrador carece de folio hasta emitir el PDF con los campos requeridos. La orden exige una cotización origen. `costoTotalNeto` y `utilidadNeta` permanecen nulos cuando faltan costos, evitando utilidades ficticias.

Antes de abrir flujos adicionales se deben reforzar y probar todas las referencias cruzadas entre organización, cliente, vehículo, refacción, compra y orden. Las claves foráneas por ID no sustituyen esa validación de tenant.

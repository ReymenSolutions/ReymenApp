# Operaciones disponibles

No existe API pública de Talleres. Las acciones de servidor actuales son `createWorkshopVehicle` y `createWorkshopQuote`. Ambas exigen sesión del dueño/admin, módulo activo y objetos dentro de la organización. La cotización se crea como `BORRADOR` sin folio. Los precios/costos se reciben netos y se recalculan en el servidor.

Pendientes: emisión y descarga PDF, aprobación, conversión a orden, inventario, compras, caja, entrega y recepción de solicitudes desde landing. Ninguna integración externa debe consumir la estructura actual como contrato estable todavía.

# Operaciones disponibles

No existe API pública de Talleres. Las acciones de servidor en `src/actions/workshop.ts` cubren vehículo, cotización, emisión, envío, aprobación, conversión, refacciones, compras, recepción, avance de orden, pago, crédito y entrega. Exigen sesión, módulo activo, rol adecuado y objetos dentro de la organización. La cotización se crea como `BORRADOR` sin folio. Los precios/costos se reciben netos y se recalculan en el servidor.

Rutas privadas: `GET /api/workshop/quotes/:id/pdf` devuelve la cotización numerada sin costos; `POST /api/workshop/orders/:id/photos` guarda una foto normalizada de recepción, proceso o entrega; `GET /api/workshop/photos/:id` la devuelve solo a miembros autorizados de la misma organización. No son contratos externos estables.

Pendientes: PDF de orden, líneas adicionales autorizadas y recepción de solicitudes desde landing. Ninguna integración externa debe consumir la estructura actual como contrato estable todavía.

# Base de datos — Reymen Retail

**Corte 2 implementado en rama, no desplegado:** `20261123200000_retail_inventory_v1` crea ubicaciones, prendas, movimientos y traslados. Se aplicó y probó únicamente en PostgreSQL desechable. DEC-01, DEC-03 y DEC-05 están confirmadas en [`DECISIONS.md`](DECISIONS.md). El resto de las tablas de Fase 1 sigue pendiente.

## Convenciones del repo
- `id String @id @default(cuid())`, `organizationId` con `@@index`, `createdAt`/`updatedAt`.
- Dinero: `Decimal @db.Decimal(12, 2)`. Moneda MXN.
- Enums de Prisma para estados (`RetailItemStatus`, `RetailMovementType`, `RetailChannel`, etc.).
- Unicidad por organización: `@@unique([organizationId, code])` en prendas y pallets; folio de venta por organización.

## Implementado en corte 2

- `Branch` + `RetailLocationSettings` (DEC-01), con tipos TIENDA/BODEGA/MAYOREO. Las Misiones podrá configurarse como MAYOREO inactivo sin exponer POS ni catálogo de menudeo. No hay sedes sembradas en datos reales.
- `RetailItem`: una fila por pieza física, código único por organización, precio y costo decimal opcional. La foto se referenciará en `photoPath` tras implementar el flujo de subida.
- `RetailMovement`: bitácora con organización, pieza, tipo, ubicaciones, actor y fecha. AJUSTE/MERMA exigen motivo por restricción de base de datos.
- `RetailTransfer`: solicitud, salida y recepción con fecha y actor de cada etapa. Índice único parcial: una pieza solo puede tener un traslado abierto. El origen permanece en `RetailItem.locationId` durante EN_TRASLADO y cambia al confirmar recepción.
- Claves foráneas compuestas `[id, organizationId]` para pieza y sucursal: la base rechaza referencias cruzadas entre organizaciones.

## Pendiente

`RetailSale`, `RetailSaleItem`, caja, `RetailHold`, `RetailDiscountPlan` y `RetailEmployee` mínimo para vendedor con PIN en Fase 1 (DEC-05). `RetailPallet`, `RetailPalletItem` y `RetailAttendance` pertenecen a Fase 3.

## Ajustes que pide la auditoría
- Foto: referencia a archivo en volumen privado (DEC-03), no `Bytes` en la tabla de la prenda. El almacenamiento, subida y respaldo todavía no están implementados.
- Cliente: `customerId` → `Customer` del CRM, solo tras confirmar identidad. Una solicitud pública crea `Lead` sin enlazar automáticamente historiales por teléfono.
- Intentos de doble venta: tabla o movimiento `RetailSaleRejection` (pieza, canal, quién, cuándo) para el contador del tablero.

# Base de datos — Reymen Retail (BORRADOR)

**Borrador, sin migración aplicada.** DEC-01, DEC-03 y DEC-05 están confirmadas en [`DECISIONS.md`](DECISIONS.md). Tablas y campos según [`SPEC.md`](SPEC.md) § Modelo de datos; aquí solo se anotan las convenciones del repo y los ajustes que pide la auditoría. La migración se probará primero en una base desechable y después en test.

## Convenciones del repo
- `id String @id @default(cuid())`, `organizationId` con `@@index`, `createdAt`/`updatedAt`.
- Dinero: `Decimal @db.Decimal(12, 2)`. Moneda MXN.
- Enums de Prisma para estados (`RetailItemStatus`, `RetailMovementType`, `RetailChannel`, etc.).
- Unicidad por organización: `@@unique([organizationId, code])` en prendas y pallets; folio de venta por organización.

## Tablas (nombres del spec)
`RetailItem`, `RetailMovement`, `RetailSale`, `RetailSaleItem`, `RetailHold`, `RetailDiscountPlan`, `RetailPallet`,
`RetailEmployee` mínimo para identificar al vendedor con PIN en Fase 1 (DEC-05). `RetailPallet`, `RetailPalletItem` y `RetailAttendance` pertenecen a Fase 3; no son necesarios para la primera migración.
Ubicación: `Branch` + `RetailLocationSettings` (DEC-01); no crear una segunda tabla de sucursales.

## Ajustes que pide la auditoría
- Foto: referencia a archivo en volumen privado (DEC-03), no `Bytes` en la tabla de la prenda.
- Cliente: `customerId` → `Customer` del CRM, solo tras confirmar identidad. Una solicitud pública crea `Lead` sin enlazar automáticamente historiales por teléfono.
- Intentos de doble venta: tabla o movimiento `RetailSaleRejection` (pieza, canal, quién, cuándo) para el contador del tablero.

# Base de datos — Reymen Retail (BORRADOR)

**Borrador:** no se migra hasta cerrar DEC-01, DEC-03 y DEC-05. Tablas y campos según SPEC.md § Modelo de datos;
aquí solo se anotan las convenciones del repo y los ajustes que pide la auditoría.

## Convenciones del repo
- `id String @id @default(cuid())`, `organizationId` con `@@index`, `createdAt`/`updatedAt`.
- Dinero: `Decimal @db.Decimal(12, 2)`. Moneda MXN.
- Enums de Prisma para estados (`RetailItemStatus`, `RetailMovementType`, `RetailChannel`, etc.).
- Unicidad por organización: `@@unique([organizationId, code])` en prendas y pallets; folio de venta por organización.

## Tablas (nombres del spec)
`RetailItem`, `RetailMovement`, `RetailSale`, `RetailSaleItem`, `RetailHold`, `RetailDiscountPlan`, `RetailPallet`,
`RetailPalletItem` (Fase 3, se puede dejar preparado), `RetailEmployee` / `RetailAttendance` (Fase 3; ver DEC-05).
Ubicación: `RetailLocation` **o** `Branch` + `RetailLocationSettings` (DEC-01).

## Ajustes que pide la auditoría
- Foto: `photoPath` o referencia a un archivo según DEC-03, no `Bytes` en la tabla de la prenda.
- Cliente: `customerId` → `Customer` del CRM (ya existe, único por teléfono).
- Intentos de doble venta: tabla o movimiento `RetailSaleRejection` (pieza, canal, quién, cuándo) para el contador del tablero.

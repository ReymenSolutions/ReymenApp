# Arquitectura

- `WORKSHOP` es un `PlatformModule` activado por organización con `OrganizationModule`.
- `/portal/workshop` obtiene organización de la sesión y exige `requireModule`. Las acciones exigen además `assertModuleEnabled` y rol, y buscan los IDs por `organizationId`.
- `Customer` sigue siendo el titular CRM; `WorkshopVehicle` y los trabajos enlazan su ID. `Lead` de la futura landing deberá convertirse al Customer existente sin recaptura.
- Los precios y costos se guardan netos como `Decimal`; `src/lib/workshop/money.ts` calcula IVA y totales. Nunca se deben aceptar importes calculados por el navegador como fuente final.
- El esquema es la base, pero las operaciones pendientes deben encapsular movimientos de inventario, compras, caja y cambios de estado en transacciones, con bloqueo/idempotencia donde corresponda.
- No hay todavía carga de fotos ni generador PDF. La UI actual es una base protegida, no un MVP operable.

La auditoría previa y diferencias respecto al prompt están en [FASE0_AUDITORIA.md](./FASE0_AUDITORIA.md).

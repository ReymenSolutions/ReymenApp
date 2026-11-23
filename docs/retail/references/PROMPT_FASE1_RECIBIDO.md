# Prompt — Módulo Reymen Retail (Grupo Carvallo) en Reymen App (Codex)

> Copia y pega tal cual en Codex dentro del repo ReymenSolutions/ReymenApp, junto con el spec (`files/reymen-retail-grupo-carvallo-spec.md`). El spec es el contexto, el prompt es la orden: primero el archivo, luego el prompt.

---

```
You are Codex, working inside the ReymenSolutions/ReymenApp repository (Next.js, Prisma, PostgreSQL, Tailwind, multi-tenant).

TASK: Build the Reymen Retail module inside Reymen App. It is NOT a separate app, NOT a system per store.

SOURCE OF TRUTH:
Read first: `workspace/goals/labash-outlet-del-norte-casa-carballo-unified-system/files/reymen-retail-grupo-carvallo-spec.md`
That spec is authoritative. Do not invent prices, costs, piece counts, seller names, store addresses, or campaign results beyond what it says. If the spec says TBD / pending, leave it TBD and do not fill it with placeholder data presented as real.

CONTEXT:
- Pilot client: Grupo Carvallo, Monterrey, N.L. — 3 businesses, ONE owner.
  Labash (premium clothing, ACTIVE), Outlet del Norte (casual / saldos, ACTIVE), Casa Carballo (home goods, INACTIVE, ready to activate, NOT in the pilot).
  Correction: Las Misiones does NOT exist as a store. Do NOT create a 4th location for it. Wholesale by pallet is a MODULE, not a store.
- POS DECISION (23 Nov 2026): Reymen builds the POS. POS Reymen, WITHOUT initial invoicing, ready to add it later. NO external CFDI provider in the MVP, NO keeping GESEM as the main POS. GESEM is only a migration source via Excel batch import. There is NO live GESEM integration.
- Team: Reynol (architecture/DB/AI prompts/n8n) and Emiliano (commercial/owner relation/GESEM liaison/Meta access) are equal-level partners and decide together. Lance is an intern (cataloguing, Excel cleaning, QA, docs).

ARCHITECTURE - FOLLOW THE REALTY PATTERN (verified 11 Nov 2026):
- Add `RETAIL` to the `PlatformModule` enum in `prisma/schema.prisma` and register it in `src/lib/modules.ts`, following REALTY.
- Reuse existing modules, do not duplicate them: CRM (Lead/Customer — Retail creates NO person table), LOYALTY, AI_WHATSAPP, FOOD_OPS as pattern (Branch, inventory movements, FoodSale transaction). CORRECCIÓN 23 nov, verificada en repo commit 780430b: REYMEN_POS is NOT a POS UI — it is only the entitlement to receive sales from an external POS via webhook (`src/app/api/webhooks/pos/orders/route.ts`, `processFoodPosOrder` with `prisma.$transaction`); the retail POS screen (QR scan, seller, cash cut) must be built NEW inside RETAIL. MARKETING_ADS and NFC_QR are reserved in the enum with no schema/UI yet — do NOT assume they exist; the Meta Ads assistant and QR labels are to be built in Fase 3 / as part of Retail, not reused.
- Entitlement per organization via `OrganizationModule`. Guard all routes and server actions with `requireModule(orgId, "RETAIL")`.
- Route: `/portal/retail` with tabs: Panel, POS, Inventario, Movimientos, Mayoreo, Clientes/Lealtad, Personal, Tablero, Configuración.
- Locations are DATA, not organizations: one organization (Grupo Carvallo) with RetailLocation rows: Labash, Outlet del Norte, Casa Carballo (inactive), Bodega (new, type BODEGA).
- All new tables multi-tenant by `organizationId`. No query returns another organization's data.
- Follow the existing portal design (Realty/Talleres pattern). Do not redesign the portal.

DATA MODEL - BUILD EXACTLY AS IN THE SPEC:
- `RetailLocation`: nombre, tipo TIENDA/BODEGA, formato PREMIUM/OUTLET/HOGAR/BODEGA, activa, m2 (optional).
- `RetailItem`: ONE row = ONE physical garment. codigo unique per org (example format LAB-TOM-CAM-H-M-AZUL-001), qr derived from codigo, locationId, canal TIENDA/EN_LINEA/MAYOREO, estado DISPONIBLE/APARTADA/VENDIDA/EN_TRASLADO/MERMA, marca, categoria, tipoPrenda, talla, color, estilo, costo (internal), precioVenta, fotoUrl, fechaIngreso, vendedorAltaId. Never invent a cost when unknown — mark as no-cost in the dashboard.
- `RetailMovement`: itemId, tipo ALTA/VENTA/APARTADO/LIBERACION_APARTADO/TRASLADO/DEVOLUCION/AJUSTE/MERMA/A_MAYOREO, deLocationId/aLocationId, deCanal/aCanal, realizadoPorId (REQUIRED), fecha, motivo (required for AJUSTE/MERMA), saleId/palletId. No location/state change without a movement. A transfer leaves the item EN_TRASLADO until receipt is confirmed at destination.
- `RetailSale` + `RetailSaleItem`: folio from zero per org, locationId, canal POS/WHATSAPP/WEB, vendedorId (REQUIRED — who made the sale), clienteId (CRM, optional for anonymous retail, required for loyalty), metodoPago EFECTIVO/TARJETA/TRANSFERENCIA, descuentoId, subtotal/descuentoTotal/total (calculated), costoTotal (internal), facturaSolicitada (boolean, MVP only records it — NO CFDI stamping), estado COMPLETADA/CANCELADA. One line per unique item. A sale is a transaction: item -> VENDIDA + movement VENTA + cash INGRESO in the same step. Selling a non-DISPONIBLE item (or one held by another client) must be REJECTED.
- `RetailHold`: itemId, clienteId, canal, venceEn, estado ACTIVO/CONVERTIDO_VENTA/LIBERADO/VENCIDO. Expired holds auto-release the item.
- `RetailDiscountPlan`: Plan A/B/C, porcentaje, aplicaA, metodoPago, vigencia, estado BORRADOR/APROBADO/APLICADO/RECHAZADO, aprobadoPorId/aprobadoEn. Only APPROVED plans apply in POS and web.
- `RetailPallet` + `RetailPalletItem` (Fase 3, model may be prepared in Fase 1): codigo PAL-AAAA-####, estado ARMADO/PUBLICADO/APARTADO/VENDIDO/CANCELADO, precioPallet, compradorId, criterioArmado (rotation / days / surplus — the module SUGGESTS which items to send to wholesale), venceEn. Selling a pallet marks ALL its items VENDIDA with movement A_MAYOREO in one transaction and removes them from retail. Pallets are variable composition — do NOT hardcode a fixed composition.
- Loyalty: reuse CRM Customer + LOYALTY module. No new person table.
- Personnel (Fase 3): `RetailEmployee` + `RetailAttendance` (entrada/salida, by employee and location). In Fase 1, only vendedorId on the sale is required.

FLOWS - NO SKIPPING:
Alta (foto, codigo unico + QR, costo, precio, Bodega) -> Traslado por QR (Bodega -> tienda, EN_TRASLADO until receipt) -> Venta POS (scan QR, validate DISPONIBLE, vendedor required, approved discount only, payment, item VENDIDA + cash) / Apartado WhatsApp/web (hold with deadline -> sale or auto-release) -> Corte diario por tienda and consolidated.
Discounts: propose A/B/C -> owner approves -> only then applies in POS and web.

INVOICING:
MVP has NO electronic invoicing. Leave the CFDI hook ready (facturaSolicitada, separated totals), do NOT build CFDI stamping in the MVP.

GESEM MIGRATION:
Excel batch import only (catalog/clients/history), with validation and an error report per row, no duplicate codigos. No live GESEM API — none is documented.

WORK METHOD:
1. Start with a read-only architecture audit of the repo (like FASE0_AUDITORIA.md), verify the Realty pattern still holds, and report any drift before writing code.
2. Then implement in this order: (1) Prisma schema + migration, (2) module registration + guards, (3) /portal/retail routes + tabs + Panel from real data, (4) Location/Item/QR + label printing, (5) QR movements with who/when, (6) POS without invoicing + seller required + cash + daily cut, (7) Holds + auto-release + discount approval, (8) Dashboard + Fase 1 indicators, (9) Excel import from GESEM, (10) Docs in `docs/retail/` (PRD.md, ARCHITECTURE.md, DATABASE.md, API.md, SECURITY.md, TASKS.md, PROGRESS.md, DECISIONS.md, HANDOFF.md) so another agent can continue without rework if you run out of tokens.
3. Fase 2 (web + WhatsApp + loyalty + full indicators) and Fase 3 (pallet, personnel, Meta AI assistant, CFDI) are in the spec — do NOT build them in Fase 1. Keep docs updated as you go. Do not claim a step is done until its acceptance criterion in the spec passes.

ACCEPTANCE CRITERIA (Fase 1, from spec):
- Org without RETAIL cannot see/open Retail; org with it opens /portal/retail without errors.
- Can create a garment with unique code + QR, photo, cost and price, in Bodega.
- Scanning QR moves Bodega -> Labash and records who/when; without receipt it stays EN_TRASLADO and cannot be sold.
- POS sale requires a seller, validates DISPONIBLE, applies only an approved discount, marks the item VENDIDA and creates cash in the same transaction.
- Trying to sell a VENDIDA item or one held by another client is rejected and counted.
- Expired hold auto-releases the item.
- Unapproved discount does not apply in POS or web.
- Casa Carballo is born inactive and does not appear as an operating store; activating it is a status change, not a migration.
- Panel shows daily sales, gross margin and operating contribution per item from data, per store and consolidated, with filters. Gross margin = (price - discount) - cost. Operating contribution = gross margin - payment commission; it is NOT net profit.
- Excel import from GESEM loads the catalog with an error report, without duplicating codigos.

Do not build CFDI stamping, the Meta AI assistant, full personnel control, or the pallet module in Fase 1. Do not create a 4th store. Do not invent seller names, prices, costs, or piece counts.
```

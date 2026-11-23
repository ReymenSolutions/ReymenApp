# Acciones y rutas — Reymen Retail (PROPUESTA)

Server actions (`src/actions/retail/*`), todas con `assertModuleEnabled(orgId, "RETAIL")` + permiso. Nombres
tentativos; se ajustan al implementar.

**Servicio ya implementado en corte 2:** `src/lib/retail/inventory.ts` expone `configureRetailLocation`, `registerRetailItem`, `requestRetailTransfer`, `dispatchRetailTransfer`, `receiveRetailTransfer`, `cancelRetailTransfer` y `markRetailWaste`. Todos revalidan en servidor el entitlement, usuario activo, organización y rol. No hay server actions ni formulario público para llamarlos todavía. `registerRetailItem` acepta código explícito; QR, foto y etiqueta están pendientes.

| Acción | Qué hace | Fase |
|---|---|---|
| `createItem` | Alta de prenda con foto, costo y precio; genera código y QR; movimiento ALTA | 1 |
| `printLabels` | Etiquetas QR imprimibles de una o varias prendas | 1 |
| `startTransfer` / `receiveTransfer` | Traslado por QR: EN_TRASLADO → DISPONIBLE en destino | 1 |
| `adjustItem` | Ajuste o merma, con motivo obligatorio | 1 |
| `sellItems` | Venta atómica (vendedor, descuento aprobado, método de pago) | 1 |
| `cancelSale` | Cancelación autorizada: piezas a DISPONIBLE con movimiento | 1 |
| `holdItem` / `releaseHold` | Apartado con vencimiento; liberación manual | 1 |
| `proposeDiscount` / `approveDiscount` / `rejectDiscount` | Plan A/B/C con aprobación del dueño | 1 |
| `closeDay` | Corte diario por tienda | 1 |
| `importGesem` | Importación por lotes con reporte de errores | 1 |

Rutas: `/api/cron/retail-holds` (auto-liberación, protegida con `CRON_SECRET`, como las demás rutas del reloj).
Web pública (Fase 2): ruta pública de solo lectura de piezas DISPONIBLE + solicitud de apartado que crea `RetailHold` + `Lead`.

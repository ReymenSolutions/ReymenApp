# Tareas — Reymen Retail

Orden de trabajo según [`SPEC.md`](SPEC.md) (§ Fases y § Lista de trabajo). Marca `[x]` solo cuando esté **probado**
(prueba automática y, si aplica, revisado en `apptest.reymen.mx`). Cada tarea apunta al criterio de aceptación que cubre.

## Fase 0 — Auditoría
- [x] Auditar el repo contra el spec → [`AUDIT-FASE0.md`](AUDIT-FASE0.md)
- [x] Cerrar decisiones DEC-01 a DEC-05 → [`DECISIONS.md`](DECISIONS.md) (confirmadas 23 nov 2026)

> **Reparto:** Fase 1 completa → **Codex**. Web pública (tarea 11) → **Claude Code**, según [`WEB-CONTRACT.md`](WEB-CONTRACT.md).

## Requisitos del cliente antes de Fase 1 (Emi)
- [ ] Piezas totales por tienda y cuántas llevarán QR individual
- [ ] Quién toma fotos y quién imprime etiquetas
- [ ] Archivo de muestra exportado de GESEM (catálogo, clientes, historial)
- [ ] Vendedores por tienda (nombres y roles), m² por tienda, umbrales de excedente y reabastecimiento
- [ ] Regla del código de prenda (el formato `LAB-TOM-CAM-H-M-AZUL-001` es solo un ejemplo; se valida antes de usarlo)

## Fase 1 — Base (MVP)
1. [ ] Enum `RETAIL`, registro en `modules.ts`, permisos, guards, entrada en el menú, `/portal/retail` (criterio: org sin RETAIL no lo ve; con RETAIL abre sin errores)
2. [ ] Ubicaciones (según DEC-01): Labash, Outlet del Norte, Casa Carballo **inactiva**, Bodega
3. [ ] `RetailItem`: alta con foto, costo y precio, código único + QR, etiqueta imprimible
4. [ ] `RetailMovement`: alta, traslado con EN_TRASLADO hasta recepción, ajuste/merma con motivo, quién/cuándo
5. [ ] POS: escanear QR, vendedor obligatorio, solo descuento aprobado, venta atómica (pieza VENDIDA + movimiento + caja), rechazo y conteo de intento de doble venta, cancelación con movimiento, corte diario
6. [ ] Apartados con vencimiento y auto-liberación
7. [ ] Descuentos Plan A/B/C: propuesta → aprobación del dueño → aplicación
8. [ ] Panel y tablero: venta del día, margen bruto comercial y contribución operativa por prenda, por tienda y consolidado, con filtros
9. [ ] Importación GESEM por lotes con reporte de errores y sin duplicar códigos
10. [ ] Pruebas de aceptación de Fase 1 (lista completa en el spec)

## Fase 2 — Venta (después de aceptar Fase 1)
11. [ ] **(Claude Code)** Web pública conectada al inventario → [`PROMPT-WEB-VENTAS.md`](PROMPT-WEB-VENTAS.md) + [`WEB-CONTRACT.md`](WEB-CONTRACT.md). Necesita de Codex: enum RETAIL, ubicaciones (con `whatsappPhone`), `RetailItem` y `createHold`.
    - [x] Estructura de la web, reglas y pruebas (sin datos reales)
    - [ ] Conectar `src/lib/retail/public/source.ts` al núcleo
    - [ ] Probar en apptest con prendas reales (criterios de aceptación del prompt)
12. [ ] WhatsApp con agente IA (consulta, apartado, venta sin doble venta)
13. [ ] Lealtad (frecuencia, ticket, beneficios)
14. [ ] Indicadores completos (m², días, rotación, excedentes, reabastecimiento)

## Fase 3 — Crecimiento
15. [ ] Mayoreo por pallet + web B2B
16. [ ] Control de personal
17. [ ] Asistente IA de Meta Ads
18. [ ] CFDI con proveedor externo (solo cuando el dueño lo pida)

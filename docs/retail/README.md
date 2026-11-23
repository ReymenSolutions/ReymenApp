# Reymen Retail — Grupo Carvallo

Módulo `RETAIL` de Reymen App: inventario por pieza única con QR, POS de tienda, apartados, descuentos con aprobación y
tablero, para Labash y Outlet del Norte (Casa Carballo inactiva). Piloto: Grupo Carvallo, Monterrey, N.L.

| Documento | Para qué |
|---|---|
| [SPEC.md](SPEC.md) | Spec del cliente (fuente de verdad, 23 nov 2026) |
| [PROMPT-WEB-VENTAS.md](PROMPT-WEB-VENTAS.md) | Orden para la web pública (Fase 2) |
| [AUDIT-FASE0.md](AUDIT-FASE0.md) | Auditoría del repo contra el spec |
| [AUDIT-2026-11-23.md](AUDIT-2026-11-23.md) | Revisión de `main@6703eb6` y discrepancias vigentes |
| [PLAN-IMPLEMENTACION.md](PLAN-IMPLEMENTACION.md) | Cortes de Fase 1, pruebas en test y datos pendientes |
| [DECISIONS.md](DECISIONS.md) | Decisiones cerradas y abiertas |
| [TASKS.md](TASKS.md) | Lista de trabajo por fase |
| [PROGRESS.md](PROGRESS.md) | Bitácora de avance |
| [HANDOFF.md](HANDOFF.md) | Cómo retomar (Claude Code o Codex) |
| [WEB-CONTRACT.md](WEB-CONTRACT.md) | Qué necesita la web pública del módulo (reparto Codex / Claude Code) |
| [PRD.md](PRD.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [API.md](API.md) · [SECURITY.md](SECURITY.md) | Producto, arquitectura, datos, acciones y seguridad |
| [references/](references/README.md) | Cuatro archivos recibidos como antecedentes: ideas, mayoreo y prompts de Fase 1/2 |

**Estado:** Fase 0 terminada y decisiones DEC-01 a DEC-05 confirmadas. No hay código Retail en `main@6703eb6`. Fase 1 → Codex; web pública → Claude Code. W-01 a W-04 siguen abiertos; la activación será primero en `apptest`.

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

**Estado:** spec y prompts vigentes en `main@995f674`; la estructura web de Claude ya está en `main` pero responde 404/NOT_READY. El núcleo Fase 1 aún no existe. W-01 está cerrada; I-01 a I-03 siguen abiertas. La activación será primero en `apptest`.

Las Misiones sí existe como distribuidora de mayoreo inactiva para Fase 3; no es tienda del piloto. Los prompts vigentes son [PROMPT-MODULO-RETAIL.md](PROMPT-MODULO-RETAIL.md) y [PROMPT-FASE2-CODEX.md](PROMPT-FASE2-CODEX.md). Los de `references/` son versiones históricas.

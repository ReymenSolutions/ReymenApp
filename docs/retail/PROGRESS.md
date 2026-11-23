# Avance — Reymen Retail

Bitácora en orden cronológico (lo más nuevo abajo). Cada entrada dice **qué se hizo, dónde quedó (PR/commit) y qué
sigue**, para que cualquier agente (Claude Code o Codex) retome sin rehacer nada.

## 2026-11-23 · Fase 0 (Claude Code)
- Se guardó el spec (`SPEC.md`) y el prompt de la web (`PROMPT-WEB-VENTAS.md`) en el repo, tal como llegaron.
- Auditoría del repo en `main@780430b` → `AUDIT-FASE0.md`. El patrón Realty sigue vigente. Se encontraron 8 diferencias con el spec (Next 16 en lugar de 15, no existen Contractors ni Talleres, `Branch` ya existe, ReymenPOS existe aparte, fotos en Postgres, sin librería de Excel, vendedor usuario o PIN, línea duplicada).
- Se abrieron 5 decisiones (`DECISIONS.md`, DEC-01 a DEC-05) que cambian el modelo de datos.
- Se armaron `TASKS.md`, `HANDOFF.md` y los documentos base (PRD, ARCHITECTURE, DATABASE, API, SECURITY).
- **No se escribió código de la aplicación.**
- **Sigue:** cerrar DEC-01 a DEC-05 y luego la tarea 1 de Fase 1 (registro del módulo `RETAIL`).

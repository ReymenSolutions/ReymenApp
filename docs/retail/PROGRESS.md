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

## 2026-11-23 · Decisiones y reparto (Claude Code)
- Reynol confirmó DEC-01 a DEC-05 como se recomendaron: sucursales con `Branch` + ajustes de Retail; POS como pantalla web en Reymen App; fotos en disco del servidor; GESEM primero con archivo real (CSV siempre aceptado); vendedor como empleado con PIN.
- Reparto: **Codex** hace la Fase 1 del módulo; **Claude Code** hace la web pública. Contrato entre ambos: `WEB-CONTRACT.md`.
- Queda abierta **W-01**: ¿las prendas con canal TIENDA también salen en la web?
- **Sigue (Codex):** tarea 1 de Fase 1. **Sigue (Claude Code):** estructura de la web sobre el contrato; se conecta a datos reales cuando existan `RetailItem` y `createHold`.

## 2026-11-23 · Revisión y preparación de entrega (Codex)
- Rama `codex/retail-carvallo-discovery`, creada desde `main@6703eb6` para mantener Retail separado del PR de Taller Wolf. Se cotejó el spec adjunto con `SPEC.md` y resultó idéntico byte por byte.
- Se archivaron los cuatro adjuntos adicionales en `references/`, sin convertir los prompts de Fase 2 ni el borrador de pallets en trabajo aprobado. Se revisó el código actual y se registraron discrepancias en `AUDIT-2026-11-23.md`.
- `PLAN-IMPLEMENTACION.md` establece cortes revisables y validación primero en base desechable y `apptest`. Se corrigió `WEB-CONTRACT.md` para no unir una solicitud pública al historial de Customer por un teléfono no verificado.
- **Sin código Retail, migraciones ni despliegue en test o producción.** No se comprobó aún la instalación real de `apptest`. La web de Claude puede seguir en su rama con el contrato; no está en `main` en la base revisada.
- **Sigue:** resolver W-01 a W-04 y datos operativos a medida que cada corte los requiera; comenzar Fase 1 por entitlement y esquema mínimo en una rama de código independiente. Registrar pruebas y cambios aquí.
- Durante la revisión apareció el PR #194 de Claude con `/tienda/[slug]` inactivo hasta conectarlo al núcleo. El PR asume W-01 opción A y su stub de apartado aún tiene la firma previa; revisar la sección de integración de `WEB-CONTRACT.md` antes de conectar ambos trabajos.

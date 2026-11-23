# Handoff — Reymen Retail (para Claude Code o Codex)

Si retomas este trabajo, lee en este orden:

1. [`SPEC.md`](SPEC.md) — spec del cliente y alcance por fases.
2. [`DECISIONS.md`](DECISIONS.md) — decisiones posteriores confirmadas que corrigen el modelo del spec; las abiertas no se presumen resueltas.
3. [`AUDIT-2026-11-23.md`](AUDIT-2026-11-23.md) y [`AUDIT-FASE0.md`](AUDIT-FASE0.md) — estado real de `main`, discrepancias y patrón Realty.
4. [`WEB-CONTRACT.md`](WEB-CONTRACT.md) y `DECISIONS.md` § Reparto — contrato y carpetas de Codex/Claude. El contrato protege identidades no verificadas.
5. [`PLAN-IMPLEMENTACION.md`](PLAN-IMPLEMENTACION.md), [`TASKS.md`](TASKS.md) y [`PROGRESS.md`](PROGRESS.md) — cortes, criterios, siguiente paso y evidencia.
6. [`references/`](references/README.md) — prompts y borradores recibidos, archivados como contexto. Sus rutas `workspace/goals/...` no existen aquí; usar `docs/retail/SPEC.md`.

## Reglas de trabajo
- **No inventar datos:** precios, costos, piezas, vendedores, direcciones, fotos ni resultados. Lo pendiente se queda como TBD.
- **Antes de tocar rutas de Next.js:** esta versión es Next 16 (`AGENTS.md`); lee `node_modules/next/dist/docs/`.
- **Multi-tenant siempre:** toda consulta filtra por `organizationId`; todo acceso pasa por `assertModuleEnabled(..., "RETAIL")` (acciones) o `requireModule` (páginas).
- **Dinero en `Decimal(…, 2)`**, nunca float. El costo nunca sale a web, WhatsApp ni documentos de cliente.
- **Venta atómica:** se bloquea la pieza, se valida el estado, se cambia y se crea el movimiento en la misma `prisma.$transaction`. Patrón de referencia: `processFoodPosOrder` (`src/lib/food.ts`).
- **Pruebas:** vitest con base real (`reymen_ops_test`); cada regla del spec lleva su prueba. Antes del PR: `npx tsc --noEmit`, `npx eslint`, `npx vitest run`.
- **Ramas y PR:** trabajo en rama propia y PR a `main`. Producción despliega solo desde `main` (`deploy/update.sh`). Para probar una rama sin tocar producción: `apptest.reymen.mx` (`docs/AMBIENTE-PRUEBA.md`). No aplicar migraciones Retail en producción durante la planificación.
- **Al terminar cada paso:** actualiza `PROGRESS.md` y `TASKS.md` en el mismo PR.

## Equipo
Reynol (arquitectura, base de datos, decisión técnica final) y Emi (relación con el cliente, GESEM, piloto en tienda),
al mismo nivel. Lance (practicante): catalogación, Excel, QA y documentación; no manda nada al cliente sin revisión.

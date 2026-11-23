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
- **Sigue:** resolver I-01 a I-03 y datos operativos a medida que cada corte los requiera; comenzar Fase 1 por entitlement y esquema mínimo. Registrar pruebas y cambios aquí.
- El PR #194 de Claude usa la firma previa de apartado en su stub; revisar la sección de integración de `WEB-CONTRACT.md` antes de conectarlo.

## 2026-11-23 · Web pública: estructura (Claude Code)
- W-01 resuelta (opción A). Logo: RM del repo. WhatsApp de las tiendas: pendiente (W-03).
- Construida la web en `/tienda/<slug>`: inicio con tiendas (Casa Carballo «Próximamente»), catálogo con filtros por URL, detalle de pieza única y «Apartar por WhatsApp» (acción con límite de intentos). Ruta pública en `src/proxy.ts`. Pruebas: `src/lib/retail/public/catalog.test.ts` y `src/proxy.test.ts`.
- **Todavía no muestra nada en producción:** `source.ts` devuelve `null` hasta que exista el núcleo de Codex (ver WEB-CONTRACT § 4).
- **Sigue:** revisión visual y, cuando Codex entregue el núcleo, conectar `source.ts` y probar en `apptest.reymen.mx` con prendas reales.

## 2026-11-23 · Spec y prompts actualizados en main
- `main@995f674` corrige que Las Misiones sí existe como distribuidora de mayoreo inactiva para Fase 3; incorpora mermas, reserva de seguridad, umbral de 45 días, tiempos de traslado, indicadores y temas de personal/Meta Ads para fases posteriores.
- El prompt de Fase 1 y el de Fase 2 vigentes están ahora en `PROMPT-MODULO-RETAIL.md` y `PROMPT-FASE2-CODEX.md`. Las copias de `references/` son históricas.

## 2026-11-23 · Fase 1, corte 1: derecho y ruta (Codex)
- Rama `codex/retail-phase1-foundation`, basada en `codex/retail-carvallo-discovery` ya sincronizada con `main@995f674`. Primer corte: enum y migración `RETAIL`, etiquetas de módulo, menú condicionado al entitlement, permisos `retail:manage`/`retail:operate`, contexto de servidor y `/portal/retail` protegido. El panel muestra un estado vacío sin cifras simuladas; no existe todavía esquema de prendas ni ventas.
- `npx prisma generate` y `prisma validate`: correctos. La migración se aplicó **solo** en `reymen_retail_test`, base desechable del contenedor local `reymen-workshop-disposable`, sin tocar bases reales. `npm run typecheck`: correcto tras regenerar tipos de rutas. ESLint: 0 errores; avisos preexistentes del sidebar. `vitest` dirigido: 4 archivos, 28 pruebas pasadas (módulos, RBAC, catálogo público existente y proxy).
- **No hay despliegue ni migración en `apptest` o producción.** El criterio de aceptación de tarea 1 sigue abierto hasta recorrer la ruta con y sin entitlement en `apptest`.
- **Sigue:** esquema multi-tenant `Branch` + `RetailLocationSettings`, prenda única y movimiento atómico; después alta/QR y primer recorrido en test. No conectar `source.ts` público hasta acordar I-03 y probar identidad, concurrencia e idempotencia.

## 2026-11-23 · WhatsApp de las tiendas (Claude Code)
- W-03 resuelta: Labash 81 1420 6868 y Outlet del Norte 81 3384 7842, anotados en DECISIONS y WEB-CONTRACT para que Codex los cargue como dato de cada tienda. La web ya arma el enlace de wa.me con esos números (prueba en `catalog.test.ts`).

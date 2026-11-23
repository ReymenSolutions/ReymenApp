# Arquitectura — Reymen Retail

Propuesta sobre el patrón verificado en [`AUDIT-2026-11-23.md`](AUDIT-2026-11-23.md). DEC-01 a DEC-05 y W-01 ya están confirmadas; I-01 a I-03 siguen abiertas. La web pública existe con fuente inactiva; `/portal/retail` y su entitlement están en el primer corte. Prendas y traslados están en el segundo corte, sin UI ni ventas.

## Dónde vive
- Módulo `RETAIL` en `PlatformModule`, registrado en `src/lib/modules.ts`, con entitlement por `OrganizationModule`.
- Portal: `src/app/(portal)/portal/retail/` con `layout.tsx` + `src/lib/retail/context.ts` (como `getRealtyContext`) y pestañas: Panel, POS, Inventario, Movimientos, Mayoreo, Clientes/Lealtad, Personal, Tablero, Configuración. Las pestañas de fases futuras no se muestran hasta construirlas.
- Lógica de negocio en `src/lib/retail/*` (sin UI, probada con vitest); server actions en `src/actions/retail/*`, cada una con su guard de módulo y permiso.
- Web pública (Fase 2): ruta `/tienda/[slug]`, leyendo una vista pública del mismo inventario y siguiendo [`WEB-CONTRACT.md`](WEB-CONTRACT.md). Claude Code trabaja en ella por separado.

## Reglas que la arquitectura garantiza
1. **Una pieza, un estado.** Todo cambio de estado o ubicación pasa por una función de `src/lib/retail/movements` que crea el `RetailMovement` en la misma transacción.
2. **Venta atómica sin doble venta:** dentro de `prisma.$transaction`, actualización condicionada (`updateMany where estado = DISPONIBLE`) de cada pieza; si alguna no se actualiza, se revierte todo y se registra el intento rechazado.
3. **Auto-liberación** de apartados: un job durable e idempotente libera los vencidos con movimiento; su implementación y frecuencia se validarán contra la infraestructura real antes de activarlo. Pallets son Fase 3.
4. **Nada se captura a mano en el tablero:** todo sale de ventas, movimientos y costos.

## Decisiones vigentes

- DEC-01: `Branch` + `RetailLocationSettings`; DEC-02: POS web en App; DEC-03: fotos en volumen privado con respaldo; DEC-04: CSV y muestra real antes de XLSX; DEC-05: vendedor con PIN en Fase 1.
- I-01 a I-03 y los datos operativos siguen pendientes en [`DECISIONS.md`](DECISIONS.md) y [`TASKS.md`](TASKS.md). Las Misiones es una distribuidora inactiva para Fase 3, sin POS ni catálogo de menudeo.

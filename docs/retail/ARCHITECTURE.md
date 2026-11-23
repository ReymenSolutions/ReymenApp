# Arquitectura — Reymen Retail

Propuesta sobre el patrón verificado en AUDIT-FASE0.md. Las partes marcadas **(DEC-xx)** dependen de una decisión abierta.

## Dónde vive
- Módulo `RETAIL` en `PlatformModule`, registrado en `src/lib/modules.ts`, con entitlement por `OrganizationModule`.
- Portal: `src/app/(portal)/portal/retail/` con `layout.tsx` + `src/lib/retail/context.ts` (como `getRealtyContext`) y pestañas: Panel, POS, Inventario, Movimientos, Mayoreo, Clientes/Lealtad, Personal, Tablero, Configuración. Las pestañas de fases futuras no se muestran hasta construirlas.
- Lógica de negocio en `src/lib/retail/*` (sin UI, probada con vitest); server actions en `src/actions/retail/*`, cada una con su guard de módulo y permiso.
- Web pública (Fase 2): ruta pública tipo `/p/[slug]` o `/lealtad/[slug]`, leyendo el mismo inventario.

## Reglas que la arquitectura garantiza
1. **Una pieza, un estado.** Todo cambio de estado o ubicación pasa por una función de `src/lib/retail/movements` que crea el `RetailMovement` en la misma transacción.
2. **Venta atómica sin doble venta:** dentro de `prisma.$transaction`, actualización condicionada (`updateMany where estado = DISPONIBLE`) de cada pieza; si alguna no se actualiza, se revierte todo y se registra el intento rechazado.
3. **Auto-liberación** de apartados y pallets: un proceso del reloj (`deploy/cron-run.sh`) libera los vencidos, con movimiento.
4. **Nada se captura a mano en el tablero:** todo sale de ventas, movimientos y costos.

## Abierto
Sucursales (DEC-01), pantalla del POS (DEC-02), fotos (DEC-03), importación (DEC-04), vendedor (DEC-05).

# Plan de implementación y prueba — Grupo Carvallo

**Estado:** planificación, sin código Retail ni despliegue. Base `main@6703eb6`. Las decisiones confirmadas DEC-01 a DEC-05 de [`DECISIONS.md`](DECISIONS.md) resuelven las discrepancias del spec descritas en [`AUDIT-2026-11-23.md`](AUDIT-2026-11-23.md). Los prompts recibidos quedan archivados en [`references/`](references/README.md) para consulta, sin iniciar Fase 2 o 3.

## Límite de responsabilidades

- **Núcleo Retail (Codex):** esquema y migraciones, entitlement, permisos, catálogo por pieza, movimientos, foto privada, QR, POS web en línea, apartados, descuentos, caja, tablero e importador. Carpeta `src/lib/retail/*`, `src/actions/retail/*`, `src/app/(portal)/portal/retail/*`.
- **Web pública (Claude Code):** interfaz en `src/app/tienda/*`, `src/lib/retail/public/*`, `src/components/retail-public/*`. Lee vistas públicas del mismo `RetailItem` y llama al núcleo para apartar; no escribe estados, ventas ni caja directamente. [`WEB-CONTRACT.md`](WEB-CONTRACT.md) es el contrato común. El PR #194 contiene la estructura inactiva; todavía no está en `main` al corte de esta revisión.
- **Base de prueba:** primero PostgreSQL desechable para migraciones y pruebas automáticas, después `apptest.reymen.mx` según [`docs/AMBIENTE-PRUEBA.md`](../AMBIENTE-PRUEBA.md). No tocar producción ni importar GESEM real hasta validar formato y autorización.

## Fase 1 en cortes revisables

1. **Derecho y estructura:** `RETAIL` en Prisma y módulos, permisos, menú, layout protegido. Una organización sin derecho no ve ni abre `/portal/retail`; con derecho ve un panel vacío sin cifras inventadas. Migración solo en base desechable y luego en test.
2. **Ubicaciones y prendas:** `Branch` + `RetailLocationSettings`; configuración explícita de Labash, Outlet del Norte, Casa Carballo inactiva y Bodega solo en la organización piloto de prueba. `RetailItem` es una pieza física. Código único por organización, QR derivado, costo opcional, precio publicado, foto en volumen privado con límite y normalización. No sembrar artículos, precios ni vendedores. La regla final de códigos sigue pendiente; permitir entrada controlada del código sin asumir que el ejemplo es definitivo.
3. **Movimientos:** alta, traslado de dos pasos, merma y ajuste con motivo. Inicio de traslado deja `EN_TRASLADO`; recepción valida destino y actor, y solo entonces vuelve `DISPONIBLE`. Todas las referencias de organización se comprueban en servidor y la transición y el movimiento son atómicos.
4. **POS web en línea:** vendedor identificado mediante un registro mínimo con PIN cifrado (DEC-05), sin crear todavía asistencia ni nómina. Venta con clave de idempotencia, folio transaccional, bloqueo de pieza y rechazo durable de doble venta. El mismo commit de DB cambia estado, crea líneas, movimientos y caja. Método de pago y monto son registro, no procesamiento de tarjeta. Cancelación autorizada crea movimientos compensatorios; no elimina ventas.
5. **Descuentos y apartados:** Plan A/B/C se propone y el dueño aprueba antes de que se aplique. Apartado con plazo configurable todavía TBD, transición atómica y auto-liberación durable e idempotente. El apartado no cobra. La identidad del solicitante web es una declaración no verificada: se crea un Lead; no se enlaza a un Customer previo solo por teléfono.
6. **Panel e importación:** ventas y margen bruto comercial desde datos reales. Contribución operativa solo si se conoce costo y comisión real; si falta alguno, marcar «pendiente». Corte por tienda y consolidado. Importación GESEM de CSV con vista previa, errores por fila, lotes idempotentes y cero duplicados; `.xlsx` después de recibir un archivo auténtico y validar formato.
7. **Aceptación de Fase 1:** pruebas negativas de rol/organización, venta simultánea, idempotencia, traslado no recibido, descuento sin aprobar, apartado vencido, reversión y PDF/ticket sin costo. Recorrido en navegador y caja real de prueba en `apptest`; comparar venta, inventario, caja y corte. Publicar y activar para piloto solo tras aceptación.

## Fase 2 y 3

La web de Claude puede avanzar con estructura y contrato mientras se construye el núcleo, pero sus consultas reales y el apartado quedan cerrados hasta que existan tablas y funciones probadas. WhatsApp IA, Lealtad e indicadores completos requieren Fase 1 aceptada. Pallets, asistencia, Meta Ads y CFDI pertenecen a Fase 3. Ninguno se presenta como terminado en el MVP.

## Decisiones y datos que faltan

- **W-01:** visibilidad web de prendas `TIENDA` frente a solo `EN_LINEA`; afecta publicación, no el esquema central. Hasta cerrar, no publicar catálogo.
- **W-02:** confirmar si el precio de etiqueta es importe final al consumidor con impuestos incluidos. No inferir desglose fiscal para CFDI.
- **W-03:** fuente de comisión real por pago para la contribución operativa. Si no existe, mostrar el indicador pendiente, nunca como cero implícito.
- **W-04:** duración de apartados por canal, política de prórroga y liberación; configurar antes de activar apartados públicos.
- **Operación:** muestra de GESEM; regla de código; piezas/QR por tienda; responsables de foto y etiqueta; vendedores reales y sus permisos; m² y umbrales. Ver [`TASKS.md`](TASKS.md). El negocio Casa Carballo permanece inactivo y no cuenta como tienda operativa.

## Evidencia para pasar a test

Guardar en `PROGRESS.md` los commits, migraciones ejecutadas solo en base desechable, suites y resultados, captura del recorrido en `apptest`, diferencias encontradas y responsable de aceptación. El deploy a producción queda fuera de esta etapa.

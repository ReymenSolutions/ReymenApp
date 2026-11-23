# Decisiones — Reymen Retail

Registro de decisiones: lo cerrado no se vuelve a discutir; lo abierto se cierra con Reynol y Emi antes del paso que
lo necesita. Formato: contexto → opciones → recomendación → estado.

## Cerradas (vienen del spec)

| ID | Decisión | Fecha |
|---|---|---|
| C-01 | Retail se construye **dentro de Reymen App** como un módulo más (`RETAIL`), no como app ni sistema aparte | 23 nov 2026 |
| C-02 | POS: **lo hace Reymen**, sin facturación inicial y con el gancho listo (`facturaSolicitada`, totales separados). GESEM solo como origen de migración por Excel; sin integración en vivo | 23 nov 2026 |
| C-03 | Una sola organización (Grupo Carvallo) con varias ubicaciones; Casa Carballo nace inactiva; Las Misiones **no existe** como tienda | 18–23 nov 2026 |
| C-04 | Inventario **por pieza única** (una fila = una prenda, código único + QR) | 23 nov 2026 |
| C-05 | Web Fase 2 = apartado + confirmación por WhatsApp. Sin checkout, sin pasarela, sin envíos | 23 nov 2026 |
| C-06 | El POS solo registra método y monto; no procesa tarjetas ni guarda datos de tarjeta | 23 nov 2026 |

## Confirmadas el 23 nov 2026 por Reynol (salieron de la auditoría Fase 0)

Las 5 se confirmaron tal como se recomendaron. Se dejan el contexto y las opciones para que se entienda el porqué.

### DEC-01 · ¿`RetailLocation` nueva o usar `Branch`?
- **Contexto:** el spec pide `RetailLocation`. El repo ya tiene `Branch` (sucursales de toda la plataforma: Food, Lealtad, Realty, filtros de sucursal en reportes).
- **Opciones:**
  - A) `RetailLocation` independiente (como dice el spec).
  - B) Usar `Branch` para la sucursal y agregar `RetailLocationSettings` 1:1 (`branchId`, `tipo`, `formato`, `m2`, `direccion`).
- **Recomendación:** **B**. Evita dos listas de sucursales en el mismo negocio y reutiliza lealtad y filtros. La Bodega sería un `Branch` con `tipo = BODEGA`.
- **Estado:** ✅ CONFIRMADA (B) — 23 nov 2026.

### DEC-02 · ¿Dónde vive la pantalla del POS de tienda?
- **Contexto:** el spec pide construir el POS dentro de RETAIL. Ya existe la app ReymenPOS (cajas, cortes, impresión Epson USB, app Android, personal con PIN), pero es *offline-first*. La regla central de Retail (una pieza no se vende dos veces entre POS, WhatsApp y web) **exige confirmar con el servidor** en cada venta.
- **Opciones:**
  - A) POS de Retail como pantalla web dentro de Reymen App (`/portal/retail/pos`), siempre en línea. Es lo que dice el spec.
  - B) Modo «Retail» dentro de ReymenPOS, que llama a Reymen App para cada venta (en línea) y reutiliza impresión, cortes y app Android.
- **Recomendación:** **A para Fase 1** (lo que dice el spec, menos piezas móviles). La impresión de etiquetas y tickets se resuelve desde el navegador. Se puede revisar B si la tienda necesita imprimir por USB desde tablet Android.
- **Estado:** ✅ CONFIRMADA (A) — 23 nov 2026.

### DEC-03 · ¿Dónde se guardan las fotos de las prendas?
- **Contexto:** Realty guarda las fotos dentro de Postgres (`Bytes`). El plan incluye hasta 10 GB de fotos; en la base harían pesados los respaldos diarios, el clon de prueba y las migraciones.
- **Opciones:**
  - A) En Postgres, como Realty (rápido de hacer).
  - B) En disco del VPS (volumen Docker) servido por la app, con la ruta en la base.
  - C) Almacenamiento de objetos compatible con S3 (costo mensual aparte).
- **Recomendación:** **B** para el piloto: comprimidas con `sharp` y respaldo aparte. Pasar a C si crece.
- **Estado:** ✅ CONFIRMADA (B) — 23 nov 2026.

### DEC-04 · ¿Excel o CSV para importar de GESEM?
- **Contexto:** el repo no tiene librería de Excel. Falta verificar qué exporta GESEM (el dueño dice que sí exporta; alcance por verificar).
- **Recomendación:** pedir primero un archivo real de GESEM. Si viene en `.xlsx`, agregar una librería de lectura. Aceptar CSV siempre.
- **Estado:** ✅ CONFIRMADA — 23 nov 2026: primero se pide el archivo real de GESEM (lo consigue Emi); CSV siempre aceptado.

### DEC-05 · ¿El vendedor es un usuario o un empleado con PIN?
- **Contexto:** cada venta exige vendedor. Si cada vendedor es un `User`, necesita correo y contraseña. En tienda suele ser más práctico un empleado con PIN en una caja compartida (así lo hace ReymenPOS).
- **Opciones:** A) `User` con rol AGENT; B) `RetailEmployee` con PIN, ligado opcionalmente a un `User`.
- **Recomendación:** **B**. Además, el límite del plan (10 usuarios) cuenta usuarios del sistema, no vendedores.
- **Estado:** ✅ CONFIRMADA (B) — 23 nov 2026. Siguen pendientes los nombres y roles reales de los vendedores (datos del cliente).

## Web pública (23 nov 2026)

| ID | Decisión |
|---|---|
| W-01 | **Opción A:** la web muestra todo lo DISPONIBLE de canal TIENDA o EN_LINEA (con foto, en tienda activa). MAYOREO nunca sale suelto |
| W-02 | Logo: el **RM** que ya está en el repo (`src/app/icon.png`); no hay otro archivo del logo de Reymen |
| W-03 | WhatsApp por tienda (confirmados por Reynol, 23 nov 2026): **Labash 81 1420 6868** · **Outlet del Norte 81 3384 7842**. Se guardan como dato de cada tienda (`RetailLocationSettings.whatsappPhone`), no en el código |

## Reparto de trabajo (23 nov 2026)

| Quién | Qué | Carpetas que le pertenecen |
|---|---|---|
| **Codex** | Módulo Fase 1 completo: enum `RETAIL`, ubicaciones, prendas, QR, movimientos, POS, apartados, descuentos, tablero, importación GESEM | `prisma/schema.prisma` (tablas Retail), `src/lib/retail/*` (núcleo), `src/actions/retail/*`, `src/app/(portal)/portal/retail/*` |
| **Claude Code** | Web pública de ventas (Fase 2 del spec) | `src/app/tienda/*`, `src/lib/retail/public/*`, `src/components/retail-public/*` |

La web **no crea tablas ni reglas de inventario**: lee y llama a lo que construye Codex, según el contrato de
[`WEB-CONTRACT.md`](WEB-CONTRACT.md). Si la web necesita algo del núcleo que no está en el contrato, se agrega primero al
contrato y lo implementa el dueño de esa carpeta.

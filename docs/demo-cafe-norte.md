# Demo «Café Norte»: preparar Foods, Lealtad y POS para presentar

Organización ficticia `cafe-norte-demo` para mostrar Reymen Foods, Lealtad y Reymen POS con datos coherentes. Solo en una base de desarrollo o de demostración: los scripts se bloquean con `NODE_ENV=production` y si la organización tiene datos que no son de la demo.

## 1. Sembrar (o refrescar) los datos

Las fechas son relativas al día en que se corre el script. Repítelo el mismo día de la presentación para que «Hoy», «Últimos 7 días» y las gráficas no aparezcan vacías.

```bash
ALLOW_LOYALTY_DEMO_SEED=cafe-norte-demo npx tsx prisma/seed-loyalty-demo.ts   # organización, sucursales, 380 clientes, visitas y ventas del día
ALLOW_LOYALTY_DEMO_SEED=cafe-norte-demo npx tsx prisma/seed-food-demo.ts      # menú, recetas, modificadores, proveedores, compras, gastos y ventas por platillo
```

Ambos son idempotentes: borran y regeneran solo los datos de la demo. Corre siempre primero el de lealtad, porque las ventas por platillo se reparten sobre la venta total de cada día que él siembra.

Accesos: `demo@cafenorte.test` (dueña) o `caja@cafenorte.test` (caja), contraseña `CafeNorte2026!`. Inscripción pública: `/lealtad/cafe-norte-demo`.

## 2. Qué queda listo

- **Foods**: 4 categorías y 10 platillos con receta (tamaños chico/grande en café), modificadores con costo (leche de almendra, shot extra), 11 insumos con solo dos bajo el mínimo (aguacate y jamón), 4 proveedores con compras recientes, 5 gastos fijos y 30 días de ventas por platillo. Rentabilidad, «Platillos más vendidos» y punto de equilibrio se calculan con esos datos.
- **Lealtad**: programa «Club Café Norte» (10 visitas → bebida gratis), 380 clientes en 8 códigos postales, recompensas disponibles y canjeadas.

## 3. Reymen POS

El POS toma el menú de Reymen. Para enlazar una caja de demostración:

1. En la organización, la llave de solo lectura del POS (`foodPosReadKey`) y el servidor del POS con la organización en `REYMEN_ORGS` (misma llave de conexión). Si Foods → Operación dice que el POS no está enlazado, es este paso.
2. En la caja: ID de organización, llave de solo lectura y código de enlace; luego crear el administrador con su PIN.
3. Antes de presentar: en **Admin → Mesas** agrega algunas mesas y en **Caja** abre la caja con un fondo inicial; si no, «Cobrar» pide abrir caja primero.

## 4. Lo que no conviene mostrar como disponible

- Apple/Google Wallet solo aparece en la tarjeta del cliente cuando hay credenciales configuradas.
- Delivery (Uber Eats, Rappi, DiDi) es monitoreo: los pedidos no crean ventas ni descuentan inventario.
- Revisa también `docs/production/AUDITORIA_2026-10-28.md` («Presentación al cliente»).

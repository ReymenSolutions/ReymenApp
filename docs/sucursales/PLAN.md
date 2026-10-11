# Sucursales — plan por fases

Decidido por el usuario (2026-10-11): el **menú** es el mismo para todas las sucursales, pero habrá un **interruptor** para manejarlo por sucursal; igual el **inventario**. Cada caja del POS pertenece a una sucursal y manda sus comandas a **su** cocina. El administrador del negocio da de alta las sucursales desde ReymenApp.

La sucursal **Principal** es implícita: son las ventas con `branchId = null`. Las demás son filas de `Branch`.

| Fase | Repo | Contenido | Estado |
|---|---|---|---|
| 1 | App | Modelo `Branch`, alta/renombrar/archivar en Configuración → Sucursales, `FoodSale.branchId`, el webhook del POS acepta `branchId` (desconocido o ajeno → Principal; una cancelación hereda la de la venta), filtro "Todas / Principal / sucursal" en el inicio de Foods | hecho |
| 2 | App | Que el POS conozca las sucursales: `GET /api/v1/food/menu` devuelve `branches` (activas de la organización; entra en el ETag) | hecho |
| 3 | POS | Cada dispositivo elige su sucursal al enlazarse; cuentas, comandas y cocina (KDS) se filtran por sucursal; `branchId` en los eventos y el adaptador | pendiente |
| 4 | App | Filtro por sucursal en Ventas (resumen, canales, últimas ventas con su sucursal) y en el Centro de operaciones (mesas, cuentas y cocina de la sucursal). Rentabilidad y Platillos más vendidos siguen siendo de todo el negocio: los conteos de platillos aún no llevan sucursal (se resuelve con la fase 6, inventario por sucursal) | hecho |
| 5 | App + POS | Interruptor "menú por sucursal" (Configuración → Sucursales): cada sucursal oculta platillos y fija sus precios en Foods → Menú por sucursal; el menú del POS (`?branchId=`) lo aplica. La Principal siempre usa el menú base | hecho (app); POS toma `branchId` en el menú |
| 6 | App (el POS ya manda `branchId` y recibe el estado de stock de su sucursal por el menú) | Interruptor "inventario por sucursal" (opción a: existencias propias por sucursal, mismos proveedores y costos): `BranchStock` por insumo y sucursal (la Principal conserva `currentStock`; las sucursales empiezan en 0), las ventas del POS descuentan de la sucursal que vendió (la cancelación, de la misma), conteos, ajustes rápidos, compras y anulaciones por sucursal, traspasos entre sucursales (la Principal incluida), avisos de stock bajo y estado de agotado del menú por sucursal, y recalcular recetas / borrar ventas de prueba regresan a la sucursal de cada venta | hecho |
| 7 | App | Rentabilidad por sucursal (ingresos, costo de lo vendido, recomendaciones y menos vendidos) y platillos más vendidos por sucursal en Foods; salen del consumo de recetas, que ahora guarda la sucursal de la venta (`FoodRecipeUsage.saleBranchId`, con relleno de lo ya vendido). Los costos fijos y el punto de equilibrio siguen siendo de todo el negocio | hecho |

Las fases 5 y 6 no se pueden hacer a medias: no se agregan interruptores que no hagan nada.

# PRD — Reymen Retail

Resumen operativo del [`SPEC.md`](SPEC.md); ante cualquier diferencia, manda el spec.

## Problema (confirmado con el cliente)
Ventas por WhatsApp a mano, descuentos semanales cambiantes, sin inventario detallado (6 departamentos en el POS
actual, piezas mal clasificadas), doble venta entre línea y tienda, sin saber qué marca, talla, color o estilo se vende.

## Usuarios
- **Dueño:** ve venta, margen y contribución por tienda y consolidado; aprueba descuentos.
- **Vendedor / cajero:** vende escaneando el QR; cada venta queda a su nombre.
- **Bodega:** da de alta prendas, imprime etiquetas, traslada a tienda por QR.
- **Cliente final (Fase 2):** ve piezas disponibles en la web y aparta por WhatsApp.

## Alcance Fase 1 (MVP)
Ver TASKS.md § Fase 1. **Fuera del MVP:** CFDI, asistente de Meta Ads, control de personal completo, mayoreo por
pallet, portal de clientes, multi-organización.

## Métricas que el tablero calcula (nunca capturadas a mano)
- **Margen bruto comercial** = (precio de venta − descuento aplicado) − costo de adquisición.
- **Contribución operativa por prenda** = margen bruto comercial − comisión de pago; las devoluciones restan. No es utilidad neta.
- Venta del día, por tienda, por vendedor y por canal; intentos de doble venta rechazados.

## Criterios de aceptación
Los de SPEC.md § Criterios de aceptación, sin cambios.

# Lealtad y POS: contrato vigente

La integración síncrona de `feature/food-loyalty-demo` fue reemplazada. La documentación completa y límites están en [LOYALTY_INTEGRACION.md](LOYALTY_INTEGRACION.md).

- Enviar ventas al webhook existente con `customer.phone`, `orderId`, fecha, sucursal y montos. No requiere un bloque `loyalty`.
- ReymenApp confirma la venta y su evento en una transacción. El cron acumula visitas en otra; el POS no espera un saldo ni recompensa en la respuesta del cobro.
- `POST /api/webhooks/pos/loyalty` solo consulta por `{code}` o `{phone}`. Requiere la firma por organización y timestamp del contrato POS, módulo activo y negocio activo. No canjea.
- Canjear requiere personal autorizado en el portal. `redeemRewardId` en una orden no autoriza un descuento ni un canje. Un QR público tampoco.
- Cancelaciones completas revierten visitas y beneficios con historial. Reintentos no duplican movimientos.
- Devoluciones parciales mantienen el sello mientras quede importe positivo. El contrato actual no distingue dos devoluciones legítimas de idéntico importe sobre un mismo pedido de un replay; se necesita `refundId` para extender esa capacidad.
- No se hicieron cambios al repositorio ReymenPOS ni se activaron funciones en terminales.

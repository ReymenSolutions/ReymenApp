# Lealtad en Reymen POS — guía para el lado del POS

> Para quien mantiene **Reymen POS**. ReymenApp ya tiene todo lo de este lado
> (branch `feature/food-loyalty-demo`); al POS le toca identificar al cliente,
> mostrar su progreso y mandar un bloque `loyalty` en la orden que ya envía.

El negocio necesita los módulos **Reymen POS**, **Reymen Foods** y **Lealtad**
(`LOYALTY`) activos en Admin → Cliente → Módulos.

## Resumen del flujo en caja

1. El cajero toca **"Cliente de lealtad"** y escanea el QR de la tarjeta del
   cliente (o escribe su WhatsApp).
2. El POS llama a **`POST /api/webhooks/pos/loyalty`** y muestra:
   *"Mariana · 6/10 visitas · le faltan 4 para Bebida gratis"* y, si tiene,
   la(s) recompensa(s) disponible(s) con un botón **Canjear**.
3. Si el cajero canjea, el POS aplica el descuento en la orden como hoy
   (`discount`) y guarda el `id` de la recompensa.
4. Al cobrar, el POS manda la orden a **`POST /api/webhooks/pos/orders`** igual
   que siempre, **más** el bloque `loyalty`.
5. La respuesta trae el nuevo progreso o *"¡Recompensa desbloqueada!"*: el POS
   lo muestra en pantalla o en el ticket.

Nada más. La visita, el monto, la sucursal, la recompensa y su canje quedan
ligados a la venta en ReymenApp, y el dashboard y el mapa de Lealtad se
calculan con los tickets reales.

## Autenticación (igual que las órdenes)

Las dos rutas usan la firma que el POS ya usa para `/api/webhooks/pos/orders`:

| Header | Valor |
|---|---|
| `x-reymen-orgid` | id de la organización en Reymen |
| `x-reymen-timestamp` | milisegundos epoch (máx. 5 min de antigüedad) |
| `x-reymen-signature` | `sha256=` + HMAC-SHA256(`<timestamp>.<cuerpo crudo>`, secreto de webhooks de la organización) |
| `x-reymen-event-id` | **solo en órdenes**: id de la orden en el POS (deduplica reenvíos) |

## 1. Consultar al cliente — `POST /api/webhooks/pos/loyalty`

No registra nada; se puede llamar las veces que haga falta.

```json
{ "code": "https://app.reymen.mx/lealtad/cafe-norte/tarjeta/Kll7rxr5UTjeENyNEXqyZ0r3" }
```

`code` acepta la URL completa del QR o solo el token (24 caracteres). En lugar
de `code` se puede mandar `{ "phone": "81 5551 0001" }`.

Respuesta `200`:

```json
{
  "status": "found",
  "program": { "name": "Club Café Norte", "rewardName": "Bebida gratis", "visitGoal": 10 },
  "member": {
    "memberId": "cm…",
    "firstName": "Mariana",
    "maskedPhone": "•••• 0001",
    "progress": { "current": 6, "goal": 10, "remaining": 4 },
    "rewardsAvailable": [{ "id": "cm…", "name": "Bebida gratis", "description": "Hasta 16 oz" }]
  }
}
```

Otros `status` (también `200`): `not_enrolled` (no está inscrito: invitarlo a
escanear el QR de inscripción), `no_program`, `program_paused`.
`400` = no se mandó `code` ni `phone`. `403` con `code: "loyalty_module_disabled"`
= el negocio no tiene Lealtad.

Por privacidad la respuesta trae solo el primer nombre y el teléfono enmascarado.

## 2. Mandar la orden — `POST /api/webhooks/pos/orders`

La misma orden de siempre, con un bloque opcional `loyalty`:

```json
{
  "orderId": "A-1043",
  "branchId": "cm…",
  "grossAmount": 185,
  "netAmount": 159.48,
  "items": [{ "variantId": "cm…", "quantity": 1 }],
  "discount": { "amount": 65, "reason": "Recompensa de lealtad" },
  "loyalty": { "code": "Kll7rxr5UTjeENyNEXqyZ0r3", "redeemRewardId": "cm…" }
}
```

- `loyalty.code` o `loyalty.phone`: el cliente que se identificó en caja.
- `loyalty.redeemRewardId`: solo si se canjeó una recompensa en esta orden.
- `orderId` es importante: es la llave que evita contar dos veces la visita.

La respuesta de éxito ahora incluye `loyalty`:

```json
{
  "success": true,
  "loyalty": {
    "status": "visit_registered",
    "member": { "firstName": "Mariana", "progress": { "current": 7, "goal": 10, "remaining": 3 }, "rewardsAvailable": [] },
    "rewardUnlocked": null,
    "redeemed": { "id": "cm…", "name": "Bebida gratis" },
    "redeemError": null
  }
}
```

| `loyalty.status` | Qué mostrar |
|---|---|
| `visit_registered` | Nuevo progreso. Si `rewardUnlocked` no es null: **"¡Recompensa desbloqueada!"** |
| `already_registered` | Reenvío de la misma orden: no se contó otra vez |
| `not_counted` + `reason` | La venta SÍ se guardó, pero no contó para lealtad. `not_enrolled`, `program_paused`, `branch_not_in_program`, `cooldown` (ya registró una visita hace menos de 3 min), `amount_out_of_range` |
| `visit_voided` | Respuesta a una cancelación (ver abajo) |

Si `redeemError` es `reward_not_available`, la recompensa ya se había canjeado
(o no es de ese cliente): el POS debería avisar al cajero.

**Lealtad nunca rechaza una venta.** Si algo de lealtad no aplica, la venta se
guarda igual y `loyalty.status` dice por qué no contó.

## 3. Cancelaciones

Igual que hoy: el POS manda la orden de cancelación con el **mismo `orderId`**,
`grossAmount` negativo e items con `quantity` negativa. Si esa venta había
registrado una visita, ReymenApp:

- la marca como **anulada** (no se borra) y deja de contar en totales y mapa;
- si era del ciclo actual, le quita una visita al progreso;
- si fue la visita que desbloqueó una recompensa todavía sin canjear, anula la
  recompensa y el cliente queda a una visita de la meta;
- si la recompensa ya se había canjeado, solo anula la visita y lo deja en la
  bitácora para revisión (`needsReview: true`).

## 4. Reintentos

Si una orden se reenvía con el mismo `x-reymen-event-id`, ReymenApp responde
`{ "success": true, "duplicate": true }` sin `loyalty`. En ese caso el POS
puede volver a consultar el progreso con la ruta 1.

## Checklist del POS

- [ ] Botón "Cliente de lealtad" en caja + lector de QR (cámara o escáner USB) y opción por teléfono.
- [ ] Llamar a `/api/webhooks/pos/loyalty` y mostrar nombre, progreso y recompensas.
- [ ] Botón "Canjear" que aplica el descuento y guarda `redeemRewardId`.
- [ ] Agregar `loyalty` a la orden (y siempre `orderId`).
- [ ] Mostrar `loyalty.status` de la respuesta (progreso / recompensa desbloqueada / no contó).
- [ ] Opcional: imprimir el progreso en el ticket.

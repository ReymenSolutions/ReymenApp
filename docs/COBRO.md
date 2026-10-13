# Cobro de la suscripción mensual

Funciona **sin Stripe** y se activa solo cuando configures Stripe.

## Cómo funciona
- `Organization.billingPeriodEnd` = «pagado hasta» (próximo vencimiento). **Nulo = el cliente aún no se factura por la plataforma**: no hay avisos ni estado de pago. Así nadie existente recibe avisos por sorpresa.
- Cada pago (`BillingPayment`, solo se agrega) recorre el vencimiento un mes de calendario. Un pago adelantado suma al vencimiento actual; uno de un cliente vencido cuenta desde hoy. La `externalRef` (folio de transferencia, factura de Stripe) evita registrar el mismo pago dos veces. Un pago nunca acorta lo ya pagado.
- Estados: **Al corriente**, **Por vencer** (≤ 7 días), **Vencida**. **Nada se suspende solo**: el sistema avisa y tú decides.

## Dónde se ve
- **Portal**: banner en todas las pantallas para quien administra la cuenta (ámbar → naranja a ≤ 3 días → rojo al vencer) y bloque «Mi suscripción» en Configuración (vencimiento, mensualidad, últimos pagos).
- **Admin → Cliente → Suscripción**: estado, registrar pago (transferencia/efectivo/otro, meses, referencia) y fijar o quitar el vencimiento (con motivo). Todo auditado (`billing.payment`, `billing.due_date`).
- **Admin → Clientes**: tarjeta de **Cobranza** con vencidos y por vencer.

## Avisos
Un correo por tipo y vencimiento (llave única): 7, 3 y 1 días antes; al vencer; y a los 5 días de atraso. Si el cron estuvo parado se manda solo el aviso vigente. Los atrasos también avisan a los admins de Reymen. Con cobro automático de Stripe activo se omiten los avisos previos (solo el de atraso).

Se disparan con un cron diario:

```bash
curl -fsS -X POST https://TU_DOMINIO/api/cron/billing -H "Authorization: Bearer $CRON_SECRET"
```

Requiere `CRON_SECRET` (sin él responde 401).

## Dar de alta a un cliente
Admin → Cliente → Suscripción → «Fijar vencimiento» con su próxima fecha de pago y un motivo. Desde ahí recibe avisos; al registrar su pago se recorre un mes.

## Con Stripe (cuando lo configures)
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y el precio del plan (Admin → Planes o `STRIPE_PRICE_<LLAVE>`). El webhook toma el fin de periodo de la suscripción, registra cada `invoice.paid` (idempotente por factura) y avisa a los admins si falla un cobro (`invoice.payment_failed`).
Pendiente a propósito: compra de recargas de IA en línea (debe llamar a `applyTopup` solo con el pago confirmado) y checkout para planes con precio pactado.

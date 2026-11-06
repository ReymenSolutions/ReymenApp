# Preparar la aceptación comercial: Stripe y n8n

Este recorrido completa la validación externa del PR 183. No modifica los workflows de Claude ni el entorno productivo. Usar exclusivamente organizaciones, contactos y productos ficticios.

## 1. Stripe

1. Entrar al Dashboard de Stripe y seleccionar un sandbox o modo de pruebas. No basta con nombrar un producto «prueba»: debe estar creado dentro del entorno de pruebas.
2. Crear un producto «Reymen Automatizaciones QA», precio recurrente mensual en MXN. El importe debe coincidir con el plan de prueba de ReymenApp. Ejemplo: $500 MXN = 50000 centavos.
3. Guardar el ID `price_...`. Obtener una clave de prueba (`sk_test_...` o clave restringida `rk_test_...` con permiso de lectura de precios). No compartir la clave por chat ni guardarla en el repositorio.
4. Desde una copia revisada del PR con Node 22, ejecutar este bloque en una terminal Bash. Solo lee un precio; no crea clientes, pagos o suscripciones. La clave se solicita de forma oculta y solo se pasa al proceso hijo:

```bash
read -rs -p 'Clave Stripe de prueba (oculta): ' reymen_stripe_key
read -r -p 'ID price_ de prueba: ' reymen_stripe_price
read -r -p 'Importe mensual en centavos MXN: ' reymen_stripe_cents
STRIPE_TEST_SECRET_KEY="$reymen_stripe_key" STRIPE_TEST_PRICE_ID="$reymen_stripe_price" STRIPE_TEST_AMOUNT_CENTS="$reymen_stripe_cents" node deploy/commercial/check-stripe-test.mjs
unset reymen_stripe_key reymen_stripe_price reymen_stripe_cents
```

No activar `set -x`. Compartir únicamente el resultado JSON o el error saneado, nunca la clave. `ok: true` acredita acceso al precio y coincidencia comercial, **no** una compra completa ni recepción de webhooks.

## 2. Preparar n8n sin tocar los flujos existentes

- Usar un workflow nuevo, desactivado al importarlo, y credenciales exclusivas de prueba. No editar ni activar automáticamente los flujos WhatsApp, seguimiento o bandeja que ya están funcionando.
- Empezar con Manual Trigger y un resultado sintético; no conectar Twilio, correo ni contactos reales.
- Obtener una automatización de la organización QA en ReymenApp con cuota 2. Su secreto es propio de esa automatización, no la clave del cliente ni `N8N_WEBHOOK_SECRET` global.
- Antes de ejecutar trabajo, llamar a `POST /api/v1/automations/runs` con `action: reserve`, automationId y executionId durable. Solo continuar con HTTP 200 y `allowed: true`. Reutilizar executionId en reintentos del mismo trabajo.
- En staging compilado (`NODE_ENV=production`) se exige HMAC: `x-reymen-timestamp` = milisegundos; `x-reymen-signature` = `sha256=` + HMAC-SHA256 hexadecimal de `<timestamp>.<cuerpo JSON exacto>`. `x-reymen-secret` solo funciona en desarrollo, no sustituye la firma en staging.
- Confirmar `succeeded` con el mismo ID cuando termine el trabajo sintético. Usar `failed` únicamente ante fallo definitivo. Un timeout conserva reserva hasta conciliación.
- Probar dos éxitos, un reintento del primero y un tercer ID rechazado por cuota. Repetir con un fallo definitivo y un resultado incierto.

## 3. Conectividad pendiente

El staging actual de Lía usa red Docker interna; `N8N_BASE_URL` apunta a un destino deshabilitado y no pasa claves Stripe a la aplicación. **Poner una clave en `.env.staging` no habilita estas conexiones.** Tampoco Stripe puede entregar webhooks a `localhost` del VPS.

Antes de realizar checkout o invocar n8n desde la aplicación se necesita definir el sandbox n8n y un mecanismo de salida/retorno exclusivo de prueba. No abrir producción ni añadir salida general al staging de Lía para resolverlo improvisadamente. El chequeo de Stripe anterior se ejecuta desde la terminal autorizada, no desde la red aislada del contenedor.

## 4. Evidencia para cerrar

- Checkout test completado y webhook recibido: plan, módulos y pago correctos.
- Repetir evento Stripe sin duplicar pago; rechazar precio/cliente ajeno.
- Consumo n8n confirmado: 2 éxitos, reintento sin duplicado y tercer trabajo bloqueado antes del efecto.
- No hay envíos ni transacciones reales.
- Solo entonces completar revisión del PR y preparar el comando de despliegue de la revisión aprobada. No ejecutar un pull de main esperando encontrar cambios que aún están en borrador.

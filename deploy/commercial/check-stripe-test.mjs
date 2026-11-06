#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

/** Read-only check. Never accepts live keys or prints credentials/provider response bodies. */
export async function checkStripeTest(env, fetchImpl = fetch) {
  const key = env.STRIPE_TEST_SECRET_KEY ?? '';
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) throw new Error('Usa una clave de Stripe de pruebas (sk_test_ o rk_test_).');
  const priceId = env.STRIPE_TEST_PRICE_ID ?? '';
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error('Indica el ID del precio de prueba (price_...).');
  const amount = Number(env.STRIPE_TEST_AMOUNT_CENTS);
  if (!/^\d+$/.test(env.STRIPE_TEST_AMOUNT_CENTS ?? '') || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Indica el importe mensual en centavos MXN (por ejemplo 50000 para $500).');
  }
  let response;
  try {
    response = await fetchImpl(`https://api.stripe.com/v1/prices/${priceId}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch { throw new Error('No se pudo consultar Stripe. Revisa la conexión; no se creó ningún cobro.'); }
  if (!response.ok) throw new Error(`Stripe rechazó la consulta (HTTP ${response.status}). Revisa permisos y que precio/clave pertenezcan al mismo sandbox.`);
  let price;
  try { price = await response.json(); } catch { throw new Error('Stripe devolvió una respuesta no válida.'); }
  if (price.id !== priceId || price.livemode !== false || price.active !== true || price.currency !== 'mxn' ||
      price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 ||
      price.billing_scheme !== 'per_unit' || price.unit_amount !== amount || price.transform_quantity != null) {
    throw new Error('El precio debe ser de prueba, activo, mensual, en MXN y coincidir exactamente con el importe del plan, sin escalas ni transformación de cantidad.');
  }
  return { ok: true, mode: 'test', priceId, currency: 'mxn', monthlyAmountMxn: amount / 100, createdCharges: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await checkStripeTest(process.env), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

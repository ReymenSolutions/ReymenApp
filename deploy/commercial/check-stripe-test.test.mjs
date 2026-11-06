import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStripeTest } from './check-stripe-test.mjs';
const env = { STRIPE_TEST_SECRET_KEY: 'sk_test_synthetic', STRIPE_TEST_PRICE_ID: 'price_synthetic', STRIPE_TEST_AMOUNT_CENTS: '50000' };
const price = { id: 'price_synthetic', livemode: false, active: true, currency: 'mxn', type: 'recurring', recurring: { interval: 'month', interval_count: 1 }, billing_scheme: 'per_unit', unit_amount: 50000 };
test('uses only GET for the specified test price and never returns credentials', async () => {
  let calls = 0;
  const result = await checkStripeTest(env, async (url, options) => {
    calls++; assert.equal(url, 'https://api.stripe.com/v1/prices/price_synthetic');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    return Response.json(price);
  });
  assert.equal(calls, 1); assert.equal(result.monthlyAmountMxn, 500); assert.equal(result.createdCharges, 0);
  assert.equal(JSON.stringify(result).includes(env.STRIPE_TEST_SECRET_KEY), false);
});
test('rejects live keys and invalid input before making a request', async () => {
  for (const change of [{ STRIPE_TEST_SECRET_KEY: 'sk_live_synthetic' }, { STRIPE_TEST_SECRET_KEY: '' }, { STRIPE_TEST_PRICE_ID: '../customers' }, { STRIPE_TEST_AMOUNT_CENTS: '-1' }, { STRIPE_TEST_AMOUNT_CENTS: '' }]) {
    let calls = 0;
    await assert.rejects(checkStripeTest({ ...env, ...change }, async () => { calls++; }));
    assert.equal(calls, 0);
  }
});
test('rejects incompatible prices, including live data returned by a provider', async () => {
  for (const change of [{ livemode: true }, { active: false }, { currency: 'usd' }, { unit_amount: 49900 }, { billing_scheme: 'tiered' }, { recurring: { interval: 'year', interval_count: 1 } }, { transform_quantity: { divide_by: 10 } }, { id: 'price_other' }]) {
    await assert.rejects(checkStripeTest(env, async () => Response.json({ ...price, ...change })), /El precio debe/);
  }
});
test('does not expose provider errors or network details containing credentials', async () => {
  await assert.rejects(checkStripeTest(env, async () => { throw new Error(env.STRIPE_TEST_SECRET_KEY); }), error => !error.message.includes(env.STRIPE_TEST_SECRET_KEY));
  await assert.rejects(checkStripeTest(env, async () => new Response(env.STRIPE_TEST_SECRET_KEY, { status: 401 })), /HTTP 401/);
});

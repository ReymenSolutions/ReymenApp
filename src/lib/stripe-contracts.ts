import { prisma } from "./prisma";
import { getPlan } from "./plans";
import { getStripeClient, stripePriceIdFor } from "./stripe";
import { UserError } from "./user-error";

/** Creates an immutable recurring MXN price for this organization only. Browser input never determines the amount. */
export async function customContractPrice(organizationId: string, amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new UserError("Configura primero el precio mensual pactado");
  const stripe = getStripeClient();
  if (!stripe) throw new UserError("La facturación no está configurada");
  const existing = await prisma.stripeContractPrice.findUnique({ where: { organizationId_amountCents: { organizationId, amountCents } } });
  if (existing) return existing.stripePriceId;
  const product = await stripe.products.create({ name: "Reymen — Plan personalizado", metadata: { organizationId } }, { idempotencyKey: `custom-product:${organizationId}` });
  const price = await stripe.prices.create({ product: product.id, currency: "mxn", unit_amount: amountCents, recurring: { interval: "month" }, metadata: { organizationId } }, { idempotencyKey: `custom-price:${organizationId}:${amountCents}` });
  const row = await prisma.stripeContractPrice.upsert({ where: { organizationId_amountCents: { organizationId, amountCents } }, create: { organizationId, amountCents, stripePriceId: price.id }, update: {} });
  return row.stripePriceId;
}

/** Persisted agreement is the desired state. Retried by billing cron after network errors. */
export async function syncCustomSubscription(organizationId: string) {
  const stripe = getStripeClient();
  if (!stripe) return "not_configured";
  const desired = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!desired.stripeSubscriptionId || !["active", "trialing", "past_due"].includes(desired.stripeSubscriptionStatus ?? "")) return "not_applicable";
  if (desired.customMonthlyPriceMxn === null && !await prisma.stripeContractPrice.count({ where: { organizationId } })) return "not_applicable";
  const cents = Math.round(Number(desired.customMonthlyPriceMxn ?? (await getPlan(desired.plan)).priceMxn) * 100);
  const priceId = desired.customMonthlyPriceMxn !== null ? await customContractPrice(organizationId, cents) : await stripePriceIdFor(desired.plan);
  if (!priceId) throw new Error("Catalog price not configured");
  const configuredPrice = await stripe.prices.retrieve(priceId);
  if (!configuredPrice.active || configuredPrice.currency !== "mxn" || configuredPrice.unit_amount !== cents || configuredPrice.recurring?.interval !== "month" || configuredPrice.recurring.interval_count !== 1) throw new Error("Contract price mismatch");
  return prisma.$transaction(async tx => {
    // Serialize changes to the agreement and concurrent reconcilers. Never retry with stale amounts.
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    const current = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (String(current.customMonthlyPriceMxn) !== String(desired.customMonthlyPriceMxn) || current.stripeSubscriptionId !== desired.stripeSubscriptionId || current.plan !== desired.plan) return "pending";
    const sub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId!, {}, { timeout: 8000, maxNetworkRetries: 0 });
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    if (customerId !== current.stripeCustomerId || sub.items.data.length !== 1 || sub.schedule) throw new Error("Subscription requires manual review");
    const item = sub.items.data[0];
    if (item.price.id === priceId) return "synced";
    if (item.price.currency !== "mxn" || item.price.recurring?.interval !== "month" || item.price.recurring.interval_count !== 1 || item.quantity !== 1) throw new Error("Subscription interval or quantity mismatch");
    await stripe.subscriptions.update(sub.id, { items: [{ id: item.id, price: priceId, quantity: 1 }], proration_behavior: "none", billing_cycle_anchor: "unchanged" }, { timeout: 8000, maxNetworkRetries: 0 });
    await tx.auditLog.create({ data: { organizationId, action: "billing.custom_price_synced", resource: "Organization", resourceId: organizationId, metadata: { amountCents: cents, stripePriceId: priceId, effective: "next_renewal", proration: false } } });
    return "synced";
  }, { timeout: 30_000 });
}

export async function reconcileCustomSubscriptions() {
  if (!getStripeClient()) return { checked: 0, pending: 0 };
  const orgs = await prisma.organization.findMany({ where: { OR: [{ customMonthlyPriceMxn: { not: null } }, { stripeContractPrices: { some: {} } }], stripeSubscriptionId: { not: null }, stripeSubscriptionStatus: { in: ["active", "trialing", "past_due"] } }, select: { id: true } });
  let pending = 0;
  for (const org of orgs) {
    try { if ((await syncCustomSubscription(org.id)) !== "synced") pending++; }
    catch { pending++; /* Desired price remains persisted for the next cron run. */ }
  }
  return { checked: orgs.length, pending };
}

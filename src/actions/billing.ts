"use server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { customContractPrice } from "@/lib/stripe-contracts";
import { getStripeClient, isStripeConfigured, stripePriceIdFor } from "@/lib/stripe";
import type { UserRole } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
import { getPlans } from "@/lib/plans";
import { UserError } from "@/lib/user-error";

async function requireBillingManager() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new UserError("Sin permisos");
  return session;
}

async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new UserError("La facturación no está configurada");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { organizationId: org.id },
  }, { idempotencyKey: `organization-customer:${org.id}` });
  await prisma.organization.update({
    where: { id: orgId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Starts a Stripe Checkout session to subscribe the org to a paid plan. Returns the URL to redirect to. */
/** Amount is resolved server-side from the catalog or the saved custom agreement. */
export async function createCheckoutSession(plan: string): Promise<{ url: string }> {
  const session = await requireBillingManager();
  const stripe = getStripeClient();
  if (!stripe) throw new UserError("La facturación no está configurada");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId! } });
  const custom = org.customPlan || org.customMonthlyPriceMxn !== null;
  const chosen = (await getPlans({ includeInactive: custom })).find(p => p.key === plan);
  if (!chosen) throw new UserError("Plan no disponible");
  if (custom && plan !== org.plan) throw new UserError("Elige tu plan personalizado vigente");
  const amountCents = Math.round(Number(custom ? org.customMonthlyPriceMxn : chosen.priceMxn) * 100);
  if (custom && (!org.customMonthlyPriceMxn || amountCents <= 0)) throw new UserError("Configura primero el precio mensual pactado");
  if (org.stripeSubscriptionId && ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(org.stripeSubscriptionStatus ?? "")) throw new UserError("Administra tu suscripción actual desde el portal de pagos");
  const priceId = custom ? await customContractPrice(org.id, amountCents) : await stripePriceIdFor(plan);
  if (!priceId) throw new UserError(`No hay un precio de Stripe configurado para el plan ${plan}`);

  const price = await stripe.prices.retrieve(priceId);
  if (!price.active || price.currency !== "mxn" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.unit_amount !== amountCents) throw new UserError("El precio de Stripe no coincide con la mensualidad del plan en MXN");

  const customerId = await getOrCreateStripeCustomer(session.user.organizationId!);
  const baseUrl = getAppUrl();

  // Re-read the agreement after external price creation, before authorizing checkout.
  const current = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
  if (current.plan !== org.plan || current.customPlan !== org.customPlan || String(current.customMonthlyPriceMxn) !== String(org.customMonthlyPriceMxn)) throw new UserError("El acuerdo cambió; actualiza antes de contratar");
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/portal/settings?billing=success`,
    cancel_url: `${baseUrl}/portal/settings?billing=cancelled`,
    metadata: { organizationId: session.user.organizationId!, plan },
    subscription_data: { metadata: { organizationId: org.id } },
  });

  if (!checkoutSession.url) throw new UserError("No se pudo crear la sesión de pago");
  return { url: checkoutSession.url };
}

/** Opens Stripe's hosted billing portal so the org can manage/cancel their existing subscription. */
export async function createBillingPortalSession(): Promise<{ url: string }> {
  const session = await requireBillingManager();
  const stripe = getStripeClient();
  if (!stripe) throw new UserError("La facturación no está configurada");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId! } });
  if (!org.stripeCustomerId) throw new UserError("Esta organización aún no tiene una suscripción");

  const baseUrl = getAppUrl();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${baseUrl}/portal/settings`,
  });

  return { url: portalSession.url };
}

export async function getBillingInfo(): Promise<{
  stripeEnabled: boolean;
  plan: string;
  hasActiveSubscription: boolean;
}> {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId } });
  return {
    stripeEnabled: isStripeConfigured(),
    plan: org.plan,
    hasActiveSubscription: org.stripeSubscriptionStatus === "active" || org.stripeSubscriptionStatus === "trialing",
  };
}

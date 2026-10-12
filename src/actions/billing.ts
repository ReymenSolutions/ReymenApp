"use server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getStripeClient, isStripeConfigured, PLAN_PRICE_ENV } from "@/lib/stripe";
import type { UserRole } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";
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
  });
  await prisma.organization.update({
    where: { id: orgId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Starts a Stripe Checkout session to subscribe the org to a paid plan. Returns the URL to redirect to. */
/**
 * Solo Professional: Business tiene precio pactado por cliente
 * (Organization.customMonthlyPriceUsd), no un precio fijo de Stripe.
 */
export async function createCheckoutSession(plan: "professional"): Promise<{ url: string }> {
  const session = await requireBillingManager();
  const stripe = getStripeClient();
  if (!stripe) throw new UserError("La facturación no está configurada");

  if (plan !== "professional") throw new UserError("Este plan se contrata con una cotización, no con pago en línea");
  const priceId = PLAN_PRICE_ENV[plan];
  if (!priceId) throw new UserError(`No hay un precio de Stripe configurado para el plan ${plan}`);

  const customerId = await getOrCreateStripeCustomer(session.user.organizationId!);
  const baseUrl = getAppUrl();

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/portal/settings?billing=success`,
    cancel_url: `${baseUrl}/portal/settings?billing=cancelled`,
    metadata: { organizationId: session.user.organizationId!, plan },
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

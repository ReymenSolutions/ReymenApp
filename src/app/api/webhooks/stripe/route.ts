import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient, planForPriceId } from "@/lib/stripe";
import { reconcilePlanEntitlements } from "@/lib/plan-entitlements";
import { getPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { syncSmartcardMemberLimitForPlan } from "@/lib/smartcard-link";
import { recordPayment } from "@/lib/billing";
import { notifyAdmins } from "@/lib/admin-notifications";

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Billing not configured" }, { status: 503 });

  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organizationId;
        if (orgId && session.subscription) {
          const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
          const owner = await prisma.organization.findFirst({ where: { id: orgId, stripeCustomerId: customerId ?? "" }, select: { id: true } });
          if (!owner) throw new Error("Checkout customer mismatch");
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const subscriptionCustomer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
          if (subscriptionCustomer !== customerId) throw new Error("Subscription customer mismatch");
          await applySubscriptionToOrg(orgId, subscription, event.created);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const org = await prisma.organization.findFirst({
          where: { stripeCustomerId: subscription.customer as string },
          select: { id: true },
        });
        if (org) await applySubscriptionToOrg(org.id, subscription, event.created);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const org = await prisma.organization.findFirst({
          where: { stripeCustomerId: subscription.customer as string },
          select: { id: true },
        });
        if (org) {
          // La baja de una suscripción vieja (otro id) o un evento atrasado no deben degradar a quien ya tiene otra vigente.
          const starter = await getPlan("starter");
          const downgraded = await prisma.$transaction(async tx => {
          const result = await tx.organization.updateMany({
            where: { id: org.id, stripeSubscriptionId: subscription.id, OR: [{ stripeEventAt: null }, { stripeEventAt: { lt: new Date(event.created * 1000) } }] },
            data: { plan: "starter", stripeSubscriptionId: null, stripeSubscriptionStatus: "canceled", stripeEventAt: new Date(event.created * 1000) },
          });
          if (result.count) await reconcilePlanEntitlements(tx, org.id, starter.modules);
          return result;
          });
          if (downgraded.count === 0) break;
          const smartcardMemberLimit = await syncSmartcardMemberLimitForPlan(org.id, "starter");
          await logAudit({
            organizationId: org.id,
            action: "billing.subscription_canceled",
            resource: "Organization",
            resourceId: org.id,
            metadata: { smartcardMemberLimit },
          });
        }
        break;
      }
      case "invoice.paid": {
        // Cada cobro mensual recorre el vencimiento. Se identifica por la factura: un reintento del webhook no duplica nada.
        const invoice = event.data.object as Stripe.Invoice;
        const org = await prisma.organization.findFirst({ where: { stripeCustomerId: invoice.customer as string }, select: { id: true } });
        const periodEndSec = invoice.lines?.data?.[0]?.period?.end;
        if (org && invoice.id && periodEndSec) {
          if (invoice.currency !== "mxn") throw new Error("Unsupported invoice currency");
          const out = await recordPayment(org.id, { amountMxn: (invoice.amount_paid ?? 0) / 100, method: "STRIPE", periodEnd: new Date(periodEndSec * 1000), externalRef: invoice.id });
          if (out.applied) await logAudit({ organizationId: org.id, action: "billing.payment", resource: "Organization", resourceId: org.id, metadata: { source: "stripe", invoice: invoice.id, periodEnd: out.periodEnd.toISOString() } });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const org = await prisma.organization.findFirst({ where: { stripeCustomerId: invoice.customer as string }, select: { id: true, name: true } });
        if (org) {
          await logAudit({ organizationId: org.id, action: "billing.payment_failed", resource: "Organization", resourceId: org.id, metadata: { invoice: invoice.id ?? null } });
          const text = `${org.name}: Stripe no pudo cobrar la mensualidad.`;
          await notifyAdmins({ subject: `Cobranza: falló el cobro de ${org.name}`, html: `<p>${text}</p>`, text }).catch(() => undefined);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[stripe webhook] processing failed:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function applySubscriptionToOrg(orgId: string, subscription: Stripe.Subscription, eventCreatedSec: number) {
  const priceId = subscription.items.data[0]?.price.id;
  const plan = await planForPriceId(priceId);
  if (!plan) throw new Error("Unknown subscription price");
  const catalogPlan = await getPlan(plan);
  // An incomplete/unpaid checkout must not provision paid products. Existing access on payment trouble is retained for manual review.
  const provision = ["active", "trialing"].includes(subscription.status);

  // Stripe no garantiza el orden de entrega: solo se aplica un evento más nuevo que el último aplicado. Así un
  // "updated" atrasado nunca restaura un plan anterior sobre uno más reciente.
  const eventAt = new Date(eventCreatedSec * 1000);
  const applied = await prisma.$transaction(async tx => {
  const result = await tx.organization.updateMany({
    where: { id: orgId, OR: [{ stripeEventAt: null }, { stripeEventAt: { lte: eventAt } }] },
    data: {
      ...(provision ? { plan } : {}),
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripeEventAt: eventAt,
    },
  });
  if (result.count && provision) await reconcilePlanEntitlements(tx, orgId, catalogPlan.modules);
  return result;
  });
  if (applied.count === 0 || !provision) return;
  // El fin del periodo actual de Stripe es el "pagado hasta" del cliente (nunca lo acorta: ver recordPayment).
  const periodEndSec = subscription.items.data[0]?.current_period_end;
  if (periodEndSec && (subscription.status === "active" || subscription.status === "trialing")) {
    const periodEnd = new Date(periodEndSec * 1000);
    await prisma.organization.updateMany({ where: { id: orgId, OR: [{ billingPeriodEnd: null }, { billingPeriodEnd: { lt: periodEnd } }] }, data: { billingPeriodEnd: periodEnd } });
  }

  // SmartCard guarda su propio límite de integrantes; se iguala al del plan.
  const smartcardMemberLimit = await syncSmartcardMemberLimitForPlan(orgId, plan);

  await logAudit({
    organizationId: orgId,
    action: "billing.plan_change",
    resource: "Organization",
    resourceId: orgId,
    metadata: { plan, status: subscription.status, source: "stripe", smartcardMemberLimit },
  });
}

-- Orden de eventos de Stripe: un evento atrasado no pisa a uno más nuevo.
ALTER TABLE "Organization" ADD COLUMN "stripeEventAt" TIMESTAMP(3);

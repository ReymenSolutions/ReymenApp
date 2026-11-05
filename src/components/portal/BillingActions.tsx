"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, CreditCard, ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCheckoutSession, createBillingPortalSession } from "@/actions/billing";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

interface BillingActionsProps {
  hasActiveSubscription: boolean;
  plans: { key: string; name: string }[];
}

export function BillingActions({ hasActiveSubscription, plans }: BillingActionsProps) {
  const { lang } = usePreferences();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleUpgrade(plan: string) {
    setLoadingPlan(plan);
    try {
      const { url } = await createCheckoutSession(plan);
      window.location.href = url;
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al iniciar el pago" : "Error starting payment")));
      setLoadingPlan(null);
    }
  }

  async function handleManageBilling() {
    setLoadingPlan("portal");
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al abrir la facturación" : "Error opening billing")));
      setLoadingPlan(null);
    }
  }

  if (hasActiveSubscription) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={handleManageBilling} disabled={loadingPlan === "portal"}>
        {loadingPlan === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        {lang === "es" ? "Gestionar facturación" : "Manage billing"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {plans.map(plan => <Button key={plan.key} variant="outline" size="sm" onClick={() => handleUpgrade(plan.key)} disabled={loadingPlan !== null}>
        {loadingPlan === plan.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {lang === "es" ? "Contratar" : "Subscribe to"} {plan.name}
      </Button>)}
      {/* Business puede tener precio pactado por cliente: no hay un precio fijo que
          cobrar en Stripe, se pide una cotización por Solicitudes. */}
      <Button asChild variant="outline" size="sm" className="flex-1">
        <Link href="/portal/requests">
          <MessageSquare className="h-4 w-4" />
          {lang === "es" ? "Solicitar cotización" : "Request a quote"}
        </Link>
      </Button>
    </div>
  );
}

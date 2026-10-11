"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { createLeadFromCustomer } from "@/actions/customers";
import { getErrorMessage } from "@/lib/user-error";

/** Convierte a un cliente del POS en contacto del CRM y abre su ficha. */
export function CreateLeadFromCustomerButton({ customerId }: { customerId: string }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await createLeadFromCustomer(customerId);
            toast.success(res.created ? (es ? "Contacto creado" : "Contact created") : es ? "Enlazado a su contacto" : "Linked to its contact");
            router.push(`/portal/leads/${res.leadId}`);
          } catch (e) {
            toast.error(getErrorMessage(e, es ? "No se pudo crear el contacto" : "Couldn't create the contact"));
          }
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
      {es ? "Crear contacto" : "Create contact"}
    </Button>
  );
}

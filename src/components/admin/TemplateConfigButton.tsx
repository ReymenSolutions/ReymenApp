"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutomationConfigDialog } from "@/components/admin/AutomationConfigDialog";
import { usePreferences } from "@/context/preferences";

/** Abre la pantalla de parámetros de una plantilla n8n instalada (la misma que la de los blueprints). */
export function TemplateConfigButton({ orgId, automationId }: { orgId: string; automationId: string }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => setOpen(automationId)}>
        <Settings2 className="mr-1 h-3 w-3" /> {lang === "es" ? "Configurar" : "Configure"}
      </Button>
      <AutomationConfigDialog orgId={orgId} automationId={open} onClose={() => setOpen(null)} />
    </>
  );
}

"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutomationConfigDialog, type ConfigApi } from "@/components/admin/AutomationConfigDialog";
import { getOwnerConfigForm, saveOwnerConfig } from "@/actions/automation-config";
import { usePreferences } from "@/context/preferences";

/** «Ajustar» en cada automatización del portal: abre la misma pantalla de parámetros, pero solo con los que el dueño puede editar. */
export function OwnerAutomationConfig({ automationId }: { automationId: string }) {
  const { lang } = usePreferences();
  const es = lang !== "en";
  const [open, setOpen] = useState(false);
  const api: ConfigApi = {
    load: (id) => getOwnerConfigForm(id),
    save: (id, config) => saveOwnerConfig({ automationId: id, config }),
    ownerNote: es ? "Aquí ves los ajustes que puedes cambiar tú. El resto (cuándo actúa, a quién escribe y el envío real) lo ajusta tu equipo Reymen." : "Here you see the settings you can change yourself. The rest (when it acts, who it writes to and live sending) is handled by your Reymen team.",
  };
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> {es ? "Ajustar" : "Adjust"}
      </Button>
      <AutomationConfigDialog orgId="" automationId={open ? automationId : null} onClose={() => setOpen(false)} api={api} />
    </>
  );
}

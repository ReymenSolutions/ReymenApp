"use client";

import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { installTemplateForClient } from "@/actions/admin/templates";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

interface Client {
  id: string;
  name: string;
}

interface Version {
  id: string;
  version: string;
  isLatest: boolean;
}

interface InstallForClientDialogProps {
  templateId: string;
  templateName: string;
  clients: Client[];
  versions: Version[];
}

export function InstallForClientDialog({
  templateId,
  templateName,
  clients,
  versions,
}: InstallForClientDialogProps) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedVersion, setSelectedVersion] = useState(
    versions.find((v) => v.isLatest)?.id ?? versions[0]?.id ?? ""
  );

  async function handleInstall() {
    if (!selectedOrg || !selectedVersion) {
      toast.error(lang === "es" ? "Selecciona un cliente y una versión" : "Select a client and a version");
      return;
    }
    setLoading(true);
    try {
      await installTemplateForClient(selectedOrg, templateId, selectedVersion);
      toast.success(lang === "es" ? "Template instalado para el cliente" : "Template installed for the client");
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al instalar" : "Error installing")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Download className="h-4 w-4" />
          {lang === "es" ? "Instalar para cliente" : "Install for client"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Instalar" : "Install"}: {templateName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="installforclientdialog-f1">{lang === "es" ? "Cliente" : "Client"}</Label>
            <Select onValueChange={setSelectedOrg}>
              <SelectTrigger id="installforclientdialog-f1">
                <SelectValue placeholder={lang === "es" ? "Seleccionar cliente" : "Select client"} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="installforclientdialog-f2">{lang === "es" ? "Versión" : "Version"}</Label>
            <Select value={selectedVersion} onValueChange={setSelectedVersion}>
              <SelectTrigger id="installforclientdialog-f2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.version} {v.isLatest ? (lang === "es" ? "— última" : "— latest") : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={handleInstall} disabled={loading || !selectedOrg}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Instalar" : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

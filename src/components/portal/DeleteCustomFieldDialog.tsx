"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePreferences } from "@/context/preferences";
import { deleteCustomField, getCustomFieldUsage } from "@/actions/custom-fields";
import { getErrorMessage } from "@/lib/user-error";

/**
 * Confirmación para eliminar un campo personalizado, la misma en Configuración, en el engrane de la tabla de contactos y en
 * la ficha del contacto: cuenta cuántos contactos tienen dato en el campo antes de dejar borrarlo (no se puede deshacer).
 */
export function DeleteCustomFieldDialog({ field, onClose, onDeleted, archiveHint = true }: { field: { id: string; label: string } | null; onClose: () => void; onDeleted?: (id: string) => void; archiveHint?: boolean }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [contacts, setContacts] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const id = field?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContacts(null);
    getCustomFieldUsage(id)
      .then((u) => !cancelled && setContacts(u.contacts))
      .catch(() => !cancelled && setContacts(0));
    return () => {
      cancelled = true;
    };
  }, [id]);

  function confirm() {
    if (!field) return;
    startTransition(async () => {
      try {
        await deleteCustomField(field.id);
        toast.success(es ? "Campo eliminado" : "Field deleted");
        onDeleted?.(field.id);
        onClose();
      } catch (e) {
        toast.error(getErrorMessage(e, es ? "No se pudo eliminar" : "Couldn't delete"));
      }
    });
  }

  return (
    <Dialog open={field !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es ? `¿Eliminar el campo «${field?.label ?? ""}»?` : `Delete the “${field?.label ?? ""}” field?`}</DialogTitle>
          <DialogDescription>
            {contacts === null
              ? es ? "Revisando cuántos contactos tienen datos en este campo…" : "Checking how many contacts have data in this field…"
              : contacts > 0
                ? es
                  ? `Se borrarán el campo y el dato que ${contacts === 1 ? "1 contacto tiene" : `${contacts} contactos tienen`} en él. Esta acción no se puede deshacer.`
                  : `The field and the data ${contacts === 1 ? "1 contact has" : `${contacts} contacts have`} in it will be deleted. This can't be undone.`
                : es
                  ? "Se borrará el campo. Ningún contacto tiene datos en él. Esta acción no se puede deshacer."
                  : "The field will be deleted. No contact has data in it. This can't be undone."}
            {archiveHint && (es ? " Si solo quieres ocultarlo y conservar los datos, usa «Archivar» en Configuración." : " If you only want to hide it and keep the data, use “Archive” in Settings.")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>{es ? "Cancelar" : "Cancel"}</Button>
          <Button variant="destructive" onClick={confirm} disabled={pending || contacts === null}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {es ? "Eliminar campo" : "Delete field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

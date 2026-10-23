"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { deleteUserAsAdmin } from "@/actions/admin/users";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { isPlatformRole } from "@/lib/user-edit-rules";

/** Elimina definitivamente a un usuario (con confirmación). Sugiere Desactivar si solo se quiere quitar el acceso. */
export function AdminDeleteUserDialog({ user, onDeleted }: { user: { id: string; name: string | null; email: string; role: string }; onDeleted?: (id: string) => void }) {
  const { lang } = usePreferences();
  const { data: session } = useSession();
  const es = lang === "es";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Nadie se elimina a sí mismo; los administradores de la plataforma solo los elimina un super admin.
  if (session?.user?.id === user.id) return null;
  if (isPlatformRole(user.role) && session?.user?.role !== "SUPER_ADMIN") return null;
  const label = user.name ?? user.email;

  async function confirm() {
    setLoading(true);
    try {
      await deleteUserAsAdmin(user.id);
      toast.success(es ? "Usuario eliminado" : "User deleted");
      setOpen(false);
      onDeleted?.(user.id);
    } catch (e) {
      toast.error(getErrorMessage(e, es ? "Error al eliminar usuario" : "Error deleting user"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="h-7 gap-1.5 px-2 text-slate-500 hover:text-red-600" aria-label={es ? `Eliminar ${user.email}` : `Delete ${user.email}`}>
        <Trash2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{es ? "Eliminar" : "Delete"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es ? "Eliminar usuario" : "Delete user"}</DialogTitle>
            <DialogDescription className="sr-only">{es ? "Confirma la eliminación definitiva." : "Confirm permanent deletion."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm text-slate-600">
            <p>{es ? `Vas a eliminar a ${label} (${user.email}). No se puede deshacer.` : `You are about to delete ${label} (${user.email}). This can't be undone.`}</p>
            <p>{es ? "Sus notas, mensajes, oportunidades y visitas se conservan, pero sin autor. Si solo quieres quitarle el acceso, usa Desactivar." : "Their notes, messages, opportunities and visits are kept, but without an author. If you only want to remove access, use Deactivate."}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>{es ? "Cancelar" : "Cancel"}</Button>
            <Button variant="destructive" onClick={confirm} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {es ? "Eliminar definitivamente" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

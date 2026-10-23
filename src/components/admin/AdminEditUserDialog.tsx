"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserAsAdmin } from "@/actions/admin/users";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { EDITABLE_ROLES, isPlatformRole } from "@/lib/user-edit-rules";

const ROLE_LABELS: Record<(typeof EDITABLE_ROLES)[number], { es: string; en: string }> = {
  SUPER_ADMIN: { es: "Super Admin", en: "Super Admin" },
  ADMIN: { es: "Admin", en: "Admin" },
  OWNER: { es: "Propietario", en: "Owner" },
  MANAGER: { es: "Manager", en: "Manager" },
  AGENT: { es: "Agente", en: "Agent" },
  VIEWER: { es: "Viewer", en: "Viewer" },
  CLIENT: { es: "Cliente", en: "Client" },
};
const NO_ORG = "__none__";

export interface EditableUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  organizationId: string | null;
}

/**
 * Editar a un usuario ya creado: nombre, email, rol, organización y (opcional) restablecer contraseña.
 * Un super administrador puede además pertenecer a una organización (p. ej. ser su propietario): se elige SUPER_ADMIN y
 * su organización. `fixedOrgId` fija la organización cuando se edita desde la ficha de un cliente.
 */
export function AdminEditUserDialog({ user, orgs = [], fixedOrgId, onSaved }: { user: EditableUser; orgs?: { id: string; name: string }[]; fixedOrgId?: string; onSaved?: () => void }) {
  const { lang } = usePreferences();
  const { data: session } = useSession();
  const actorIsSuper = session?.user?.role === "SUPER_ADMIN";
  const isSelf = session?.user?.id === user.id;
  const es = lang === "es";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [orgId, setOrgId] = useState(fixedOrgId ?? user.organizationId ?? NO_ORG);
  const [password, setPassword] = useState("");

  // Un admin (no super) no toca a los administradores de la plataforma ni asigna esos roles.
  const targetIsPlatform = isPlatformRole(user.role);
  if (!actorIsSuper && targetIsPlatform) return null;
  const roles = EDITABLE_ROLES.filter((r) => actorIsSuper || !isPlatformRole(r));

  function openDialog() {
    setName(user.name ?? ""); setEmail(user.email); setRole(user.role);
    setOrgId(fixedOrgId ?? user.organizationId ?? NO_ORG); setPassword("");
    setOpen(true);
  }

  async function save() {
    setLoading(true);
    try {
      const res = await updateUserAsAdmin(user.id, { name, email, role, organizationId: orgId === NO_ORG ? null : orgId, password });
      if (res.signedOut) {
        toast.success(es ? "Cambios guardados. Vuelve a iniciar sesión." : "Changes saved. Please sign in again.");
        signOut({ callbackUrl: "/login" });
        return;
      }
      toast.success(es ? "Usuario actualizado" : "User updated");
      setOpen(false);
      onSaved?.();
    } catch (e) {
      toast.error(getErrorMessage(e, es ? "Error al actualizar usuario" : "Error updating user"));
    } finally {
      setLoading(false);
    }
  }

  const bothHint = role === "SUPER_ADMIN" && orgId !== NO_ORG;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog} className="h-7 gap-1.5 px-2 text-slate-500 hover:text-brand-600" aria-label={es ? `Editar ${user.email}` : `Edit ${user.email}`}>
        <Pencil className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{es ? "Editar" : "Edit"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es ? "Editar usuario" : "Edit user"}</DialogTitle>
            <DialogDescription className="sr-only">{es ? "Cambia nombre, email, rol, organización o contraseña." : "Change name, email, role, organization or password."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor={`eu-name-${user.id}`}>{es ? "Nombre completo *" : "Full name *"}</Label>
              <Input id={`eu-name-${user.id}`} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`eu-email-${user.id}`}>Email *</Label>
              <Input id={`eu-email-${user.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{es ? "Rol *" : "Role *"}</Label>
              <Select value={role} onValueChange={setRole} disabled={isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r][lang === "es" ? "es" : "en"]}</SelectItem>)}
                </SelectContent>
              </Select>
              {isSelf && <p className="text-xs text-slate-500">{es ? "No puedes cambiar tu propio rol." : "You can't change your own role."}</p>}
            </div>
            {!fixedOrgId && (
              <div className="space-y-2">
                <Label>{es ? "Organización" : "Organization"}</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ORG}>{es ? "Sin organización" : "No organization"}</SelectItem>
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bothHint && (
              <p className="rounded-md bg-brand-50 p-2 text-xs text-brand-800">
                {es
                  ? "Será super administrador de la plataforma y además miembro de esa organización, con permisos de propietario dentro de ella."
                  : "They will be a platform super admin and also a member of that organization, with owner permissions inside it."}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor={`eu-pass-${user.id}`}>{es ? "Nueva contraseña (opcional)" : "New password (optional)"}</Label>
              <Input id={`eu-pass-${user.id}`} type="password" autoComplete="new-password" placeholder={es ? "Déjala vacía para no cambiarla" : "Leave empty to keep it"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <p className="text-xs text-slate-500">
              {es ? "Si cambias el rol, la organización, el email o la contraseña, esa persona tendrá que volver a iniciar sesión." : "If you change the role, organization, email or password, that person will need to sign in again."}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {es ? "Guardar cambios" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

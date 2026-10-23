"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUserAsAdmin } from "@/actions/admin/users";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { EDITABLE_ROLES, isPlatformRole } from "@/lib/user-edit-rules";
import { ROLE_LABELS } from "@/components/admin/AdminEditUserDialog";

const NO_ORG = "__none__";

/**
 * «Nuevo usuario» de Admin → Usuarios: cualquier rol y, si aplica, la organización a la que se liga. Los roles de
 * cliente exigen organización; Admin y Super Admin pueden ir sin ella o ligados a una (p. ej. un super admin que también
 * es dueño de su organización). Un admin sin rango de super admin no ve los roles de plataforma.
 */
export function AdminCreateUserDialog({ orgs }: { orgs: { id: string; name: string }[] }) {
  const { lang } = usePreferences();
  const { data: session } = useSession();
  const actorIsSuper = session?.user?.role === "SUPER_ADMIN";
  const es = lang === "es";
  const roles = EDITABLE_ROLES.filter((r) => actorIsSuper || !isPlatformRole(r));

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("OWNER");
  const [orgId, setOrgId] = useState<string>(NO_ORG);
  const [password, setPassword] = useState("");

  const needsOrg = !isPlatformRole(role);

  function reset() { setName(""); setEmail(""); setRole(actorIsSuper ? "ADMIN" : "OWNER"); setOrgId(NO_ORG); setPassword(""); }

  async function save() {
    setLoading(true);
    try {
      await createUserAsAdmin({ name, email, role, organizationId: orgId === NO_ORG ? null : orgId, password });
      toast.success(es ? "Usuario creado" : "User created");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, es ? "Error al crear usuario" : "Error creating user"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" />{es ? "Nuevo usuario" : "New user"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{es ? "Nuevo usuario" : "New user"}</DialogTitle>
          <DialogDescription>
            {es ? "Elige su rol y, si pertenece a un cliente, la organización." : "Pick their role and, if they belong to a client, the organization."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cu-name">{es ? "Nombre completo *" : "Full name *"}</Label>
            <Input id="cu-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={es ? "Ana Martínez" : "Jane Doe"} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cu-email">Email *</Label>
            <Input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@reymen.mx" />
          </div>
          <div className="space-y-2">
            <Label>{es ? "Rol *" : "Role *"}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r][es ? "es" : "en"]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{needsOrg ? (es ? "Organización *" : "Organization *") : (es ? "Organización (opcional)" : "Organization (optional)")}</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ORG}>{needsOrg ? (es ? "Elige una organización" : "Pick an organization") : (es ? "Sin organización" : "No organization")}</SelectItem>
                {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {role === "SUPER_ADMIN" && orgId !== NO_ORG && (
              <p className="rounded-md bg-brand-50 p-2 text-xs text-brand-800">
                {es ? "Será super administrador de la plataforma y además miembro de esa organización, con permisos de propietario dentro de ella." : "They will be a platform super admin and also a member of that organization, with owner permissions inside it."}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cu-pass">{es ? "Contraseña temporal *" : "Temporary password *"}</Label>
            <Input id="cu-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={es ? "Mínimo 8 caracteres" : "At least 8 characters"} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {es ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

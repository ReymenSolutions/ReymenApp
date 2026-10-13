"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Plus, Power, PowerOff, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createOrgUser, updateOrgUser, setUserActive } from "@/actions/admin/users";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const ORG_ROLES = ["OWNER", "MANAGER", "AGENT", "VIEWER"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

const ROLE_LABELS_ES: Record<OrgRole, string> = {
  OWNER: "Propietario",
  MANAGER: "Manager",
  AGENT: "Agente",
  VIEWER: "Viewer",
};
const ROLE_LABELS_EN: Record<OrgRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  AGENT: "Agent",
  VIEWER: "Viewer",
};

export interface AdminClientUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean;
}

const createSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(ORG_ROLES),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});
type CreateFormData = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(ORG_ROLES),
});
type EditFormData = z.infer<typeof editSchema>;

function CreateUserDialog({ orgId }: { orgId: string }) {
  const { lang } = usePreferences();
  const roleLabels = lang === "es" ? ROLE_LABELS_ES : ROLE_LABELS_EN;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "AGENT" },
  });

  async function onSubmit(data: CreateFormData) {
    setLoading(true);
    try {
      await createOrgUser(orgId, data);
      toast.success(lang === "es" ? "Usuario creado" : "User created");
      reset({ role: "AGENT", name: "", email: "", password: "" });
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al crear usuario" : "Error creating user")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {lang === "es" ? "Añadir usuario" : "Add user"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Añadir usuario" : "Add user"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="adminclientuserspanel-f1">{lang === "es" ? "Nombre completo *" : "Full name *"}</Label>
            <Input id="adminclientuserspanel-f1" placeholder={lang === "es" ? "Ana Martínez" : "Jane Doe"} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminclientuserspanel-f2">Email *</Label>
            <Input id="adminclientuserspanel-f2" type="email" placeholder="ana@empresa.com" {...register("email")} />
            {errors.email && <p className="text-xs text-red-500">{translateMessage(errors.email.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>{lang === "es" ? "Rol *" : "Role *"}</Label>
            <Select defaultValue="AGENT" onValueChange={(v) => setValue("role", v as OrgRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORG_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminclientuserspanel-f3">{lang === "es" ? "Contraseña temporal *" : "Temporary password *"}</Label>
            <Input id="adminclientuserspanel-f3" type="password" placeholder={lang === "es" ? "Mínimo 8 caracteres" : "At least 8 characters"} {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{translateMessage(errors.password.message)}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user }: { user: AdminClientUser }) {
  const { lang } = usePreferences();
  const roleLabels = lang === "es" ? ROLE_LABELS_ES : ROLE_LABELS_EN;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const safeRole = (ORG_ROLES.includes(user.role as OrgRole) ? user.role : "AGENT") as OrgRole;

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name ?? "", role: safeRole },
  });

  function openDialog() {
    reset({ name: user.name ?? "", role: safeRole });
    setOpen(true);
  }

  async function onSubmit(data: EditFormData) {
    setLoading(true);
    try {
      await updateOrgUser(user.id, data);
      toast.success(lang === "es" ? "Usuario actualizado" : "User updated");
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al actualizar usuario" : "Error updating user")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog} className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "es" ? "Editar usuario" : "Edit user"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="adminclientuserspanel-f4">{lang === "es" ? "Nombre completo *" : "Full name *"}</Label>
              <Input id="adminclientuserspanel-f4" {...register("name")} />
              {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label>{lang === "es" ? "Rol *" : "Role *"}</Label>
              <Select defaultValue={safeRole} onValueChange={(v) => setValue("role", v as OrgRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {lang === "es" ? "Guardar cambios" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToggleActiveButton({ user }: { user: AdminClientUser }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const nextActive = !user.isActive;

  async function handleConfirm() {
    setLoading(true);
    try {
      await setUserActive(user.id, nextActive);
      toast.success(
        nextActive
          ? (lang === "es" ? "Usuario activado" : "User activated")
          : (lang === "es" ? "Usuario desactivado" : "User deactivated")
      );
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={`h-7 w-7 p-0 ${user.isActive ? "text-slate-400 hover:text-red-600" : "text-slate-400 hover:text-emerald-600"}`}
      >
        {user.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nextActive
                ? (lang === "es" ? "Activar usuario" : "Activate user")
                : (lang === "es" ? "Desactivar usuario" : "Deactivate user")}
            </DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-slate-600">
            {nextActive
              ? (lang === "es" ? `${user.name ?? user.email} podrá volver a acceder a la plataforma.` : `${user.name ?? user.email} will be able to sign in again.`)
              : (lang === "es" ? `${user.name ?? user.email} ya no podrá acceder a la plataforma.` : `${user.name ?? user.email} will no longer be able to sign in.`)}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {lang === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button variant={nextActive ? "default" : "destructive"} onClick={handleConfirm} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {nextActive ? (lang === "es" ? "Activar" : "Activate") : (lang === "es" ? "Desactivar" : "Deactivate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminClientUsersPanel({ orgId, users }: { orgId: string; users: AdminClientUser[] }) {
  const { t, lang } = usePreferences();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.users}</CardTitle>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <CreateUserDialog orgId={orgId} />
        </div>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            {lang === "es" ? "Sin usuarios aún" : "No users yet"}
          </p>
        ) : (
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium text-slate-900">{user.name ?? t.noName}</p>
                  <p className="truncate text-xs text-slate-400">{user.email}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <Badge variant="secondary" className="capitalize">{user.role.toLowerCase()}</Badge>
                  <Badge variant={user.isActive ? "success" : "destructive"}>
                    {user.isActive ? t.statusActive : t.inactive}
                  </Badge>
                  <EditUserDialog user={user} />
                  <ToggleActiveButton user={user} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

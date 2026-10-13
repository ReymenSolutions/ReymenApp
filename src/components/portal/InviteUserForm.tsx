"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteTeamMember } from "@/actions/team";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(["MANAGER", "AGENT", "VIEWER"]),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

const ROLE_LABELS_ES: Record<string, string> = {
  MANAGER: "Manager — Gestión completa",
  AGENT: "Agente — Conversaciones y leads",
  VIEWER: "Viewer — Solo lectura",
};

const ROLE_LABELS_EN: Record<string, string> = {
  MANAGER: "Manager — Full management",
  AGENT: "Agent — Conversations and leads",
  VIEWER: "Viewer — Read only",
};

export function InviteUserForm() {
  const { lang } = usePreferences();
  const ROLE_LABELS = lang === "es" ? ROLE_LABELS_ES : ROLE_LABELS_EN;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: "AGENT" },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await inviteTeamMember(data);
      toast.success(lang === "es" ? "Usuario invitado exitosamente" : "User invited successfully");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al invitar usuario" : "Error inviting user")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" />
          {lang === "es" ? "Invitar usuario" : "Invite user"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Invitar miembro al equipo" : "Invite team member"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="inviteuserform-f1">{lang === "es" ? "Nombre completo *" : "Full name *"}</Label>
            <Input id="inviteuserform-f1" placeholder={lang === "es" ? "Ana Martínez" : "Jane Doe"} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inviteuserform-f2">Email *</Label>
            <Input id="inviteuserform-f2" type="email" placeholder="ana@empresa.com" {...register("email")} />
            {errors.email && <p className="text-xs text-red-500">{translateMessage(errors.email.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>{lang === "es" ? "Rol *" : "Role *"}</Label>
            <Select defaultValue="AGENT" onValueChange={(v) => setValue("role", v as FormData["role"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inviteuserform-f3">{lang === "es" ? "Contraseña temporal *" : "Temporary password *"}</Label>
            <Input id="inviteuserform-f3" type="password" placeholder={lang === "es" ? "Mínimo 8 caracteres" : "At least 8 characters"} {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{translateMessage(errors.password.message)}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Invitar" : "Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateTeamMember } from "@/actions/team";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(["MANAGER", "AGENT", "VIEWER"]),
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

interface EditUserDialogProps {
  userId: string;
  userName: string;
  userRole: string;
}

export function EditUserDialog({ userId, userName, userRole }: EditUserDialogProps) {
  const { lang } = usePreferences();
  const roleLabels = lang === "es" ? ROLE_LABELS_ES : ROLE_LABELS_EN;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const safeRole = (["MANAGER", "AGENT", "VIEWER"].includes(userRole) ? userRole : "AGENT") as FormData["role"];

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: userName, role: safeRole },
  });

  function openDialog() {
    reset({ name: userName, role: safeRole });
    setOpen(true);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await updateTeamMember(userId, data);
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
      <Button
        variant="outline"
        size="sm"
        onClick={openDialog}
        className="gap-1.5 text-slate-600 hover:text-brand-600 hover:border-brand-300"
      >
        <Pencil className="h-3.5 w-3.5" />
        {lang === "es" ? "Editar" : "Edit"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "es" ? "Editar miembro del equipo" : "Edit team member"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edituserdialog-f1">{lang === "es" ? "Nombre completo *" : "Full name *"}</Label>
              <Input id="edituserdialog-f1" placeholder="Ana Martínez" {...register("name")} />
              {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label>{lang === "es" ? "Rol *" : "Role *"}</Label>
              <Select
                defaultValue={safeRole}
                onValueChange={(v) => setValue("role", v as FormData["role"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {lang === "es" ? "Cancelar" : "Cancel"}
              </Button>
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

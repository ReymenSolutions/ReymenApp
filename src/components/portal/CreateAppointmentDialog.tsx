"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { createAppointment } from "@/actions/appointments";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  title: z.string().min(2, "Mínimo 2 caracteres"),
  description: z.string().optional(),
  startTime: z.string().min(1, "Requerido"),
  endTime: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ServiceOption { id: string; name: string; durationMinutes: number }

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateAppointmentDialog({ services = [] }: { services?: ServiceOption[] }) {
  const { t, lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceId, setServiceId] = useState<string>("__none__");

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      startTime: toLocalDatetimeValue(now),
      endTime: toLocalDatetimeValue(inOneHour),
    },
  });

  const selectedService = services.find((s) => s.id === serviceId);
  const startTimeValue = watch("startTime");

  async function onSubmit(data: FormData) {
    if (!selectedService && !data.endTime) {
      toast.error(lang === "es" ? "Indica una hora de fin o selecciona un servicio" : "Enter an end time or select a service");
      return;
    }
    setLoading(true);
    try {
      await createAppointment({
        ...data,
        endTime: selectedService ? undefined : data.endTime,
        serviceId: selectedService ? selectedService.id : undefined,
      });
      toast.success(t.apptSuccessMsg);
      reset();
      setServiceId("__none__");
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, t.apptErrorMsg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {t.newAppointmentBtn}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.scheduleTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="createappointmentdialog-f1">{t.apptTitleLabel} *</Label>
            <Input id="createappointmentdialog-f1" placeholder={t.apptTitlePlaceholder} {...register("title")} />
            {errors.title && <p className="text-xs text-red-500">{translateMessage(errors.title.message)}</p>}
          </div>
          {services.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="createappointmentdialog-f2">{lang === "es" ? "Servicio (opcional)" : "Service (optional)"}</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger id="createappointmentdialog-f2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{lang === "es" ? "Sin servicio (duración manual)" : "No service (manual duration)"}</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="createappointmentdialog-f3">{t.apptStartLabel} *</Label>
              <Input id="createappointmentdialog-f3" type="datetime-local" {...register("startTime")} />
              {errors.startTime && <p className="text-xs text-red-500">{translateMessage(errors.startTime.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t.apptEndLabel} {!selectedService && "*"}</Label>
              {selectedService ? (
                <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                  {startTimeValue
                    ? new Date(new Date(startTimeValue).getTime() + selectedService.durationMinutes * 60 * 1000).toLocaleTimeString(lang === "es" ? "es-MX" : "en-US", { hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </div>
              ) : (
                <>
                  <Input type="datetime-local" {...register("endTime")} />
                  {errors.endTime && <p className="text-xs text-red-500">{translateMessage(errors.endTime.message)}</p>}
                </>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="createappointmentdialog-f4">{t.apptNotesLabel}</Label>
            <Textarea id="createappointmentdialog-f4" placeholder={t.apptNotesPlaceholder} rows={2} {...register("description")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.apptScheduleBtn}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

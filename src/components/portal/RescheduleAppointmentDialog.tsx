"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { usePreferences } from "@/context/preferences";
import { rescheduleAppointment } from "@/actions/appointments";
import { getErrorMessage } from "@/lib/user-error";

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RescheduleAppointmentDialog({
  appointmentId,
  currentStart,
  currentEnd,
}: {
  appointmentId: string;
  currentStart: Date;
  currentEnd: Date;
}) {
  const { lang } = usePreferences();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const [startTime, setStartTime] = useState(toLocalDatetimeValue(currentStart));

  async function handleSubmit() {
    setLoading(true);
    try {
      const newStart = new Date(startTime);
      const newEnd = new Date(newStart.getTime() + durationMs);
      await rescheduleAppointment({ appointmentId, startTime: newStart.toISOString(), endTime: newEnd.toISOString() });
      toast.success(lang === "es" ? "Cita reprogramada" : "Appointment rescheduled");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al reprogramar" : "Error rescheduling")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          title={lang === "es" ? "Reprogramar" : "Reschedule"}
        >
          <CalendarClock className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Reprogramar cita" : "Reschedule appointment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="rescheduleappointmentdialog-f1">{lang === "es" ? "Nueva fecha y hora de inicio" : "New start date and time"}</Label>
          <Input id="rescheduleappointmentdialog-f1" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <p className="text-xs text-slate-400">
            {lang === "es" ? "Se conserva la duración original de la cita." : "The appointment's original duration is preserved."}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Reprogramar" : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRequest } from "@/actions/requests";
import { usePreferences } from "@/context/preferences";
import { translateMessage } from "@/lib/user-error";

const schema = z.object({
  title: z.string().min(1, "Título requerido"),
  description: z.string().min(10, "Descripción mínima de 10 caracteres"),
  type: z.enum(["support", "new_automation", "change", "question"]),
  priority: z.enum(["low", "medium", "high"]),
});

type FormData = z.infer<typeof schema>;

export function CreateRequestDialog() {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: "medium" },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => fd.append(k, v));
    try {
      await createRequest(fd);
      toast.success(t.reqSuccessMsg);
      reset();
      setOpen(false);
    } catch {
      toast.error(t.reqErrorMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {t.newRequestBtn}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.sendRequestTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="createrequestdialog-f1">{t.reqTitleLabel} *</Label>
            <Input id="createrequestdialog-f1" placeholder={t.reqTitleLabel} {...register("title")} />
            {errors.title && <p className="text-xs text-red-500">{translateMessage(errors.title.message)}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t.adminColType}</Label>
              <Select onValueChange={(v) => setValue("type", v as FormData["type"])}>
                <SelectTrigger><SelectValue placeholder={t.reqSelect} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">{t.typeSupport}</SelectItem>
                  <SelectItem value="new_automation">{t.typeNewAutomation}</SelectItem>
                  <SelectItem value="change">{t.typeChange}</SelectItem>
                  <SelectItem value="question">{t.typeQuestion}</SelectItem>
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-red-500">{translateMessage(errors.type.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t.adminColPriority}</Label>
              <Select defaultValue="medium" onValueChange={(v) => setValue("priority", v as FormData["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t.adminPriorityLow}</SelectItem>
                  <SelectItem value="medium">{t.adminPriorityMedium}</SelectItem>
                  <SelectItem value="high">{t.adminPriorityHigh}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="createrequestdialog-f2">{t.reqDescLabel} *</Label>
            <Textarea id="createrequestdialog-f2"
              placeholder={t.reqDescPlaceholder}
              rows={4}
              {...register("description")}
            />
            {errors.description && <p className="text-xs text-red-500">{translateMessage(errors.description.message)}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.reqSendBtn}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

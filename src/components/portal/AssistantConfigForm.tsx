"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertWhatsAppAssistant } from "@/actions/whatsapp-assistant";
import { usePreferences } from "@/context/preferences";
import type { WhatsAppAssistant } from "@prisma/client";
import { translateMessage } from "@/lib/user-error";

const schema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const COPY = {
  es: { rulebook: "El saludo, el estilo y las reglas del agente se escriben en el Rulebook (una sola fuente para todos los canales).", link: "Abrir el Rulebook" },
  en: { rulebook: "The agent's greeting, style and rules live in the Rulebook (one source for every channel).", link: "Open the Rulebook" },
};

/** Identidad del agente: cómo se llama y su número de WhatsApp. Todo lo demás vive en el Rulebook. */
export function AssistantConfigForm({ assistant }: { assistant: WhatsAppAssistant | null }) {
  const { t, lang } = usePreferences();
  const c = COPY[lang === "en" ? "en" : "es"];
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: assistant?.name ?? t.assistantNamePlaceholder, phoneNumber: assistant?.phoneNumber ?? "" },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await upsertWhatsAppAssistant(data);
      toast.success(t.assistantSaved);
    } catch {
      toast.error(t.assistantSaveError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t.assistantName}</Label>
          <Input placeholder={t.assistantNamePlaceholder} {...register("name")} />
          {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t.whatsappBusinessNumber}</Label>
          <Input placeholder="+52 55 1234 5678" {...register("phoneNumber")} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {c.rulebook}{" "}
        <Link href="/portal/knowledge-base" className="font-medium text-brand-700 underline-offset-2 hover:underline">{c.link}</Link>
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t.saveConfig}
        </Button>
      </div>
    </form>
  );
}

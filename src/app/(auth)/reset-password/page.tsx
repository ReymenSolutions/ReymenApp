"use client";

import { PasswordInput } from "@/components/ui/password-input";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { resetPassword } from "@/actions/password-reset";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });
type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await resetPassword({ email, token, password: data.password });
      toast.success("Contraseña actualizada. Ya puedes iniciar sesión.");
      router.push("/login");
    } catch (e) {
      toast.error(getErrorMessage(e, "Error al restablecer la contraseña"));
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-500">Este enlace no es válido. Solicita uno nuevo.</p>
        <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
          Solicitar enlace
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <PasswordInput id="password" placeholder="••••••••" {...register("password")} autoFocus />
        {errors.password && <p className="text-xs text-red-500">{translateMessage(errors.password.message)}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <PasswordInput id="confirm" placeholder="••••••••" {...register("confirm")} />
        {errors.confirm && <p className="text-xs text-red-500">{translateMessage(errors.confirm.message)}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Restablecer contraseña
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Card className="w-full max-w-sm shadow-2xl border-0">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 shadow-lg">
          <KeyRound className="h-6 w-6 text-white" />
        </div>
        <CardTitle className="text-xl">Nueva contraseña</CardTitle>
        <CardDescription>Elige una contraseña segura para tu cuenta</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />}>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}

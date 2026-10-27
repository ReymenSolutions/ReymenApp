"use client";

import { PasswordInput } from "@/components/ui/password-input";
import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { translateMessage } from "@/lib/user-error";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<LoginForm | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function attemptSignIn(email: string, password: string, code?: string) {
    // signIn() serializes options via URLSearchParams, which turns an
    // explicit `undefined` into the literal string "undefined" — only
    // include totpCode when there's a real value to send.
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      ...(code ? { totpCode: code } : {}),
    });

    if (result?.error) {
      if (result.code === "rate_limited") {
        toast.error("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
      } else if (result.code === "totp_required") {
        setPendingCredentials({ email, password });
      } else if (result.code === "totp_invalid") {
        setTotpError("Código inválido. Intenta de nuevo.");
      } else {
        toast.error("Credenciales incorrectas");
      }
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function onSubmit(data: LoginForm) {
    setLoading(true);
    try {
      await attemptSignIn(data.email, data.password);
    } catch {
      toast.error("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingCredentials) return;
    setTotpError(null);
    setLoading(true);
    try {
      await attemptSignIn(pendingCredentials.email, pendingCredentials.password, totpCode);
    } catch {
      toast.error("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  if (pendingCredentials) {
    return (
      <Card className="w-full max-w-sm shadow-2xl border-0">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 shadow-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-xl">Verificación en dos pasos</CardTitle>
          <CardDescription>Ingresa el código de tu app autenticadora</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmitTotp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totpCode">Código de 6 dígitos</Label>
              <Input
                id="totpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={9}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-slate-400">
                ¿Perdiste acceso a tu app? Usa uno de tus códigos de respaldo (formato XXXX-XXXX).
              </p>
              {totpError && <p className="text-xs text-red-500">{totpError}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !totpCode}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Verificar
            </Button>
          </form>
          <button
            onClick={() => { setPendingCredentials(null); setTotpCode(""); setTotpError(null); }}
            className="mt-4 flex w-full items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <ArrowLeft className="h-3 w-3" /> Volver
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm shadow-2xl border-0">
      <CardHeader className="text-center pb-4">
        <Image src="/icons/icon-192.png" alt="Reymen Solutions" width={56} height={56} priority className="mx-auto mb-4 h-14 w-14 rounded-xl shadow-lg" />
        <CardTitle className="text-xl">Reymen Solutions</CardTitle>
        <CardDescription>Ingresa a tu plataforma de operaciones</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@empresa.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-red-500">{translateMessage(errors.email.message)}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link href="/forgot-password" className="text-xs text-brand-600 hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-red-500">{translateMessage(errors.password.message)}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Iniciar sesión
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Automatización inteligente para hacer crecer tu negocio.
        </p>
      </CardContent>
    </Card>
  );
}

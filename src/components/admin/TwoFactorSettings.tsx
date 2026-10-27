"use client";

import { PasswordInput } from "@/components/ui/password-input";
import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { start2FAEnrollment, confirm2FAEnrollment, disable2FA } from "@/actions/two-factor";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

type Step = "idle" | "enrolling" | "backup-codes";

export function TwoFactorSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const { lang } = usePreferences();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState("");

  async function handleStart() {
    setLoading(true);
    try {
      const result = await start2FAEnrollment();
      setQrCodeDataUrl(result.qrCodeDataUrl);
      setManualSecret(result.secret);
      setStep("enrolling");
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al iniciar la configuración" : "Error starting setup")));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      const result = await confirm2FAEnrollment(code);
      setBackupCodes(result.backupCodes);
      setStep("backup-codes");
      setEnabled(true);
      setCode("");
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Código inválido" : "Invalid code")));
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    try {
      await disable2FA(password);
      setEnabled(false);
      setDisableOpen(false);
      setPassword("");
      toast.success(lang === "es" ? "2FA desactivado" : "2FA disabled");
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al desactivar" : "Error disabling")));
    } finally {
      setLoading(false);
    }
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (step === "backup-codes") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">{lang === "es" ? "Guarda tus códigos de respaldo" : "Save your backup codes"}</p>
          <p className="mt-1 text-xs text-amber-700">
            {lang === "es"
              ? "Úsalos si pierdes acceso a tu app autenticadora. Cada uno funciona una sola vez y no volverán a mostrarse."
              : "Use them if you lose access to your authenticator app. Each one works only once and won't be shown again."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-4 font-mono text-sm text-slate-100">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyBackupCodes} className="flex-1">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? (lang === "es" ? "Copiado" : "Copied") : (lang === "es" ? "Copiar códigos" : "Copy codes")}
          </Button>
          <Button onClick={() => setStep("idle")} className="flex-1">{lang === "es" ? "Ya los guardé" : "I saved them"}</Button>
        </div>
      </div>
    );
  }

  if (step === "enrolling") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          {qrCodeDataUrl && (
            <Image src={qrCodeDataUrl} alt={lang === "es" ? "Código QR para 2FA" : "2FA QR code"} width={180} height={180} unoptimized className="rounded-lg border border-slate-200" />
          )}
          <div className="w-full space-y-1.5">
            <Label htmlFor="twofactorsettings-f1" className="text-xs">{lang === "es" ? "¿No puedes escanear? Ingresa esta clave manualmente" : "Can't scan? Enter this key manually"}</Label>
            <Input id="twofactorsettings-f1" readOnly value={manualSecret} className="font-mono text-xs" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="totp-confirm">{lang === "es" ? "Código de tu app autenticadora" : "Code from your authenticator app"}</Label>
          <Input
            id="totp-confirm"
            inputMode="numeric"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep("idle")} className="flex-1">{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={handleConfirm} disabled={loading || code.length !== 6} className="flex-1">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Verificar y activar" : "Verify and activate"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {enabled ? (
          <ShieldCheck className="h-8 w-8 text-emerald-500" />
        ) : (
          <ShieldOff className="h-8 w-8 text-slate-300" />
        )}
        <div>
          <p className="text-sm font-medium text-slate-900">
            {enabled ? (lang === "es" ? "2FA activado" : "2FA enabled") : (lang === "es" ? "2FA desactivado" : "2FA disabled")}
          </p>
          <p className="text-xs text-slate-500">
            {enabled
              ? (lang === "es" ? "Tu cuenta requiere un código de tu app autenticadora al iniciar sesión." : "Your account requires a code from your authenticator app to sign in.")
              : (lang === "es" ? "Añade una capa extra de seguridad a tu cuenta de administrador." : "Add an extra layer of security to your administrator account.")}
          </p>
        </div>
      </div>

      {enabled ? (
        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDisableOpen(true)}>
          {lang === "es" ? "Desactivar" : "Disable"}
        </Button>
      ) : (
        <Button onClick={handleStart} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {lang === "es" ? "Activar 2FA" : "Enable 2FA"}
        </Button>
      )}

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "es" ? "Desactivar 2FA" : "Disable 2FA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="disable-password">{lang === "es" ? "Confirma tu contraseña" : "Confirm your password"}</Label>
            <PasswordInput
              id="disable-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleDisable}
              disabled={loading || !password}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Desactivar 2FA" : "Disable 2FA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

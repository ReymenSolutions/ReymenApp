"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePreferences } from "@/context/preferences";

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Activa o desactiva las notificaciones push en ESTE dispositivo (cada celular o computadora se activa aparte). */
export function PushOptIn() {
  const { lang } = usePreferences();
  const es = lang !== "en";
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      const key = ((await fetch("/api/push/subscribe").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { publicKey?: string | null } | null)?.publicKey ?? null;
      if (cancelled) return;
      setPublicKey(key);
      if (!key) return setState("unconfigured");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
      toast.success(es ? "Notificaciones activadas en este dispositivo" : "Notifications enabled on this device");
    } catch {
      toast.error(es ? "No se pudieron activar las notificaciones" : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unconfigured") return null;
  if (state === "unsupported") {
    return <p className="text-xs text-slate-400">{es ? "Este navegador no admite notificaciones. En iPhone: agrega Reymen a la pantalla de inicio y ábrelo desde ahí." : "This browser doesn't support notifications. On iPhone: add Reymen to the home screen and open it from there."}</p>;
  }
  if (state === "denied") {
    return <p className="text-xs text-slate-400">{es ? "Las notificaciones están bloqueadas para Reymen en este navegador. Actívalas en los ajustes del sitio." : "Notifications are blocked for Reymen in this browser. Allow them in the site settings."}</p>;
  }
  return (
    <button
      type="button"
      onClick={state === "on" ? disable : enable}
      disabled={busy}
      data-testid="push-optin"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "on" ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5 text-brand-600" />}
      {state === "on"
        ? es ? "Desactivar avisos en este dispositivo" : "Turn off alerts on this device"
        : es ? "Recibir avisos en este dispositivo (tareas y mensajes)" : "Get alerts on this device (tasks and messages)"}
    </button>
  );
}

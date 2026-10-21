"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerChannelConnection, updateChannelConnection, listChannelConnections } from "@/actions/channel-connections";
import { usePreferences } from "@/context/preferences";
import { INBOX_CHANNELS } from "@/lib/channels";
import { channelLabel } from "@/lib/ai/agents/center-copy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";
type Connection = Awaited<ReturnType<typeof listChannelConnections>>[number];
const states: Record<string, [string, string]> = { PAUSED: ["En pausa", "Paused"], STALE: ["Verificación vencida", "Verification expired"], UNVERIFIED: ["Sin verificar", "Unverified"], HEALTHY: ["Disponible según el conector", "Available according to connector"], DEGRADED: ["Requiere revisión", "Needs review"], DISCONNECTED: ["Sin conexión", "Disconnected"] };
export function Connections({ initial, agents }: { initial: Connection[]; agents: { id: string; publicName: string }[] }) {
  const { lang } = usePreferences(), es = lang === "es", router = useRouter();
  const [rows, setRows] = useState(initial), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [account, setAccount] = useState(""), [channel, setChannel] = useState("whatsapp");
  async function run(work: () => Promise<unknown>) { setPending(true); setError(""); try { await work(); setRows(await listChannelConnections()); router.refresh(); } catch { setError(es ? "No se pudo guardar. Revisa la verificación de la cuenta y recarga sus datos antes de intentar otra vez. Conservamos lo escrito." : "Could not save. Check account verification and reload its details before trying again. We kept what you typed."); } finally { setPending(false); } }
  return <section aria-label={es ? "Cuentas de canal" : "Channel accounts"} className="space-y-4">
    <h2 className="text-base font-semibold text-slate-900">{es ? "Cuentas de canal" : "Channel accounts"}</h2>
    <p className="text-sm text-slate-600">{es ? "Registrar una cuenta no la conecta. El conector debe confirmar la cuenta y sus permisos antes de habilitarla. La verificación vence después de 5 minutos sin novedades. No pegues contraseñas ni tokens." : "Registering an account does not connect it. The connector must confirm the account and permissions before you enable it. Verification expires after 5 minutes without an update. Do not paste passwords or tokens."}</p>
    <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => run(async () => setRows(await listChannelConnections()))}>{es ? "Actualizar estado" : "Refresh status"}</Button>
    {error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p><Button variant="outline" className="min-h-11" disabled={pending} onClick={() => run(async () => setRows(await listChannelConnections()))}>{es ? "Recargar cuentas" : "Reload accounts"}</Button></div>}
    {rows.length === 0 && <p className="rounded-card border border-slate-200 p-4 text-sm text-slate-600">{es ? "Aún no hay cuentas registradas. Tus conexiones anteriores siguen funcionando con su configuración actual." : "No accounts registered yet. Your previous connections continue using their current configuration."}</p>}
    <div className="grid min-w-0 gap-4 md:grid-cols-2">{rows.map(row => <Card key={row.id}><CardHeader><CardTitle>{row.label}</CardTitle><p className="text-sm text-slate-500">{channelLabel(row.channel, lang)}</p></CardHeader><CardContent className="space-y-3">
      <p className="text-sm font-medium">{(states[row.effectiveState] ?? states.UNVERIFIED)[es ? 0 : 1]}</p>
      <p className="text-xs text-slate-500">{row.checkedAt ? `${es ? "Última revisión" : "Last checked"}: ${formatDateTime(row.checkedAt, lang)}` : es ? "El conector todavía no verificó esta cuenta." : "The connector has not verified this account yet."}</p>
      <details><summary className="min-h-11 cursor-pointer text-sm text-slate-600">{es ? "Datos para vincular el conector" : "Connector linking details"}</summary><p className="break-all text-xs text-slate-500">ID: {row.id} · {es ? "Generación" : "Generation"}: {row.generation}</p></details>
      <Label htmlFor={`route-${row.id}`}>{es ? "Asistente que atiende" : "Assistant handling this account"}</Label>
      <select id={`route-${row.id}`} disabled={pending} className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-base text-slate-900" value={row.route?.enabled ? row.route.agentInstanceId : ""} onChange={e => { const id = e.target.value; void run(() => updateChannelConnection({ id: row.id, expectedVersion: row.version, enabled: row.enabled, agentInstanceId: id || null })); }}><option value="">{es ? "Atención manual" : "Manual handling"}</option>{row.route?.enabled && !agents.some(a => a.id === row.route!.agentInstanceId) && <option value={row.route.agentInstanceId} disabled>{es ? "Asistente en pausa o no disponible" : "Assistant paused or unavailable"}</option>}{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.publicName}</option>)}</select>
      <p className="text-xs text-slate-500">{es ? "Sin asistente asignado, el equipo puede responder manualmente. El modo Apagado/Sugerir/Automático del canal sigue aplicando." : "Without an assigned assistant, your team can reply manually. The channel's Off/Suggest/Automatic mode still applies."}</p>
      <p className="text-xs text-slate-500">{es ? "Pausar detiene los envíos nuevos y exige otra verificación antes de habilitar la cuenta." : "Pausing stops new sends and requires verification again before enabling this account."}</p>
      <Button variant="outline" className="min-h-11" disabled={pending || (!row.enabled && !row.canEnable)} onClick={() => run(() => updateChannelConnection({ id: row.id, expectedVersion: row.version, enabled: !row.enabled }))}>{row.enabled ? (es ? "Pausar cuenta" : "Pause account") : (es ? "Habilitar cuenta verificada" : "Enable verified account")}</Button>
      {!row.enabled && <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => run(() => updateChannelConnection({ id: row.id, expectedVersion: row.version, enabled: false, resetVerification: true }))}>{es ? "Reiniciar verificación" : "Reset verification"}</Button>}
    </CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>{es ? "Registrar una cuenta existente" : "Register an existing account"}</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => { await registerChannelConnection({ label: name, externalAccountKey: account, channel }); setName(""); setAccount(""); }); }}>
      <Label htmlFor="connection-label">{es ? "Nombre para identificar la cuenta" : "Account label"}</Label><Input id="connection-label" className="min-h-11 text-base" value={name} onChange={e => setName(e.target.value)} maxLength={80} required disabled={pending} />
      <Label htmlFor="connection-channel">{es ? "Canal" : "Channel"}</Label><select id="connection-channel" value={channel} onChange={e => setChannel(e.target.value)} disabled={pending} className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base text-slate-900">{INBOX_CHANNELS.map(c => <option key={c} value={c}>{channelLabel(c, lang)}</option>)}</select>
      <Label htmlFor="connection-account">{es ? "Identificador de cuenta del proveedor" : "Provider account identifier"}</Label><Input id="connection-account" className="min-h-11 text-base" value={account} onChange={e => setAccount(e.target.value)} maxLength={200} required disabled={pending} />
      <p className="text-xs text-slate-500">{es ? "Solicita este identificador a quien administra la conexión. No es el teléfono del cliente ni una clave de acceso." : "Ask whoever manages the connection for this identifier. It is not the customer's phone or an access key."}</p>
      <Button className="min-h-11" type="submit" loading={pending}>{es ? "Registrar sin activar" : "Register without enabling"}</Button>
    </form></CardContent></Card>
  </section>;
}

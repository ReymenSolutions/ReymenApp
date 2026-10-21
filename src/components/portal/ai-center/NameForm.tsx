"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertWhatsAppAssistant } from "@/actions/whatsapp-assistant";
import { listAgentInstances, updateLegacyAgent } from "@/actions/ai-agents";
import { getErrorMessage } from "@/lib/user-error";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
import { usePreferences } from "@/context/preferences";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
export function AgentNameForm({ initialName, version }: { initialName: string; version: { id: string; expectedVersion: number; expectedHash: string } | null }) {
  const { lang } = usePreferences(); const c = aiCenterCopy(lang); const router = useRouter();
  const friendlyError = (error: unknown) => {
    const digest = (error as { digest?: unknown } | null)?.digest;
    return typeof digest === "string" && digest.startsWith("reymen-user-error:") ? getErrorMessage(error, c.saveError) : c.saveError;
  };
  const [baseVersion, setBaseVersion] = useState(version);
  const [currentName, setCurrentName] = useState("");
  const [name, setName] = useState(initialName), [pending, setPending] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  return <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (pending) return; setPending(true); setError(""); setSaved(false);
    try { if (baseVersion) { const result = await updateLegacyAgent({ ...baseVersion, publicName: name }); setBaseVersion({ id: result.id, expectedVersion: result.configVersion, expectedHash: result.sourceHash }); } else await upsertWhatsAppAssistant({ name }); setSaved(true); setCurrentName(""); router.refresh(); }
    catch (e) { setError(friendlyError(e)); } finally { setPending(false); }
  }}>
    <Label htmlFor="agent-public-name">{c.name}</Label><Input className="min-h-11 text-base" id="agent-public-name" value={name} onChange={e => { setName(e.target.value); setSaved(false); }} required maxLength={120} disabled={pending} aria-invalid={!!error} aria-describedby={error ? "agent-name-error" : undefined} />
    {error && <div id="agent-name-error" role="alert" aria-label={c.saveError} className="space-y-2 text-sm text-red-700"><p>{error}</p><Button type="button" variant="outline" className="min-h-11" onClick={async () => { setPending(true); try { const model = await listAgentInstances(); setBaseVersion(model.instance ? { id: model.instance.id, expectedVersion: model.instance.configVersion, expectedHash: model.source.sourceHash } : null); setCurrentName(model.source.publicName); setError(""); } catch (e) { setError(friendlyError(e)); } finally { setPending(false); } }}>{c.refresh}</Button></div>}
    {currentName && <p role="status" className="text-sm text-slate-600">{lang === "es" ? "Nombre guardado actualmente" : "Currently saved name"}: {currentName}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button className="min-h-11" loading={pending} type="submit">{c.save}</Button>{saved && <p role="status" className="text-sm text-emerald-700">{c.saved}</p>}</div>
  </form>;
}

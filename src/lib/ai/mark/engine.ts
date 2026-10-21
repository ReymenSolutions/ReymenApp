import { decision, MARK_PREVIEW, sandboxInput, type ReadRequest, type ReadResult, type SandboxInput, type SandboxResult, type Step, type StopCode } from "./contract";
export type DriverContext = { question: string; channel: SandboxInput["channel"]; results: ReadResult[]; call: number };
/** Server-internal dependencies. No dependency/adaptor/function can be supplied through a server action. */
export type SandboxDependencies = {
  next: (context: DriverContext, signal: AbortSignal) => Promise<string>;
  read: (request: ReadRequest, signal: AbortSignal) => Promise<ReadResult>;
  authority: () => Promise<"ok" | "cancelled" | "authority_changed">;
  progress?: (trace: Step[]) => Promise<void>;
};
class Stop extends Error { constructor(readonly code: StopCode) { super(code); } }
/** One bounded turn. This module has no ORM, provider, transport, SQL, filesystem or write-tool imports. */
export async function runMarkSandbox(raw: SandboxInput, deps: SandboxDependencies): Promise<SandboxResult> {
  const input = sandboxInput.parse(raw), started = Date.now(), trace: Step[] = [], results: ReadResult[] = [];
  let calls = 0, reads = 0;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Stop("timeout")); }, MARK_PREVIEW.deadlineMs); });
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    if (Date.now() - started >= MARK_PREVIEW.deadlineMs) throw new Stop("timeout");
    return Promise.race([Promise.resolve().then(work), timeout]);
  }
  async function check() {
    const state = await bounded(deps.authority);
    if (state !== "ok") { controller.abort(); throw new Stop(state); }
  }
  async function record(step: Omit<Step, "number">) {
    if (trace.length >= MARK_PREVIEW.maxSteps) throw new Stop("limit_reached");
    trace.push({ ...step, number: trace.length + 1 });
    if (deps.progress) await bounded(() => deps.progress!(trace.map(s => ({ ...s }))));
  }
  const finish = (outcome: SandboxResult["outcome"], extra: { reply?: string; reason?: StopCode } = {}): SandboxResult => ({ mode: "simulation", outcome, ...extra, trace, simulatedCalls: calls, reads, elapsedMs: Date.now() - started, providerCalls: 0, externalEffects: 0, definitionVersion: MARK_PREVIEW.version, fixtureVersion: MARK_PREVIEW.fixtureVersion });
  try {
    while (calls < MARK_PREVIEW.maxCalls && trace.length < MARK_PREVIEW.maxSteps) {
      await check(); ++calls;
      let text: string;
      try { text = await bounded(() => deps.next({ question: input.question, channel: input.channel, results, call: calls }, controller.signal)); }
      catch (error) { if (error instanceof Stop) throw error; throw new Stop("provider_failed"); }
      await check();
      const parsed = typeof text === "string" && text.length <= 8000 ? (() => { try { return decision.safeParse(JSON.parse(text)); } catch { return null; } })() : null;
      if (!parsed?.success) { await record({ kind: "decision", status: "denied", code: "invalid_model_output" }); throw new Stop("invalid_model_output"); }
      const next = parsed.data;
      await record({ kind: "decision", status: "ok" });
      if (next.action === "handoff") return finish("handoff", { reason: next.reason });
      if (next.action === "reply") {
        const available = new Set(results.flatMap(r => r.sources));
        if (reads === 0 || next.sources.length === 0 || next.sources.some(id => !available.has(id)) || /https?:\/\/|\b(?:clabe|password|transferencia)\b/i.test(next.text)) throw new Stop("unsafe_reply");
        await check();
        return finish("reply", { reply: next.text });
      }
      // Validate the WHOLE batch before reading anything: mixed allowed/forbidden requests have no partial execution.
      if (reads + next.requests.length > MARK_PREVIEW.maxTools || calls >= MARK_PREVIEW.maxCalls || trace.length + next.requests.length >= MARK_PREVIEW.maxSteps) throw new Stop("limit_reached");
      if (next.requests.some(r => !(r.name === "knowledge.search" ? input.permissions.knowledge : input.permissions.customer))) throw new Stop("tool_denied");
      for (const request of next.requests) {
        await check(); ++reads;
        const value = await bounded(() => deps.read(request, controller.signal));
        await check();
        // Tool results are data; no returned callback/name/permission can become executable capability.
        if (!value || !Array.isArray(value.sources) || value.sources.length > 8 || value.sources.some(id => typeof id !== "string" || id.length > 80) || !Array.isArray(value.facts) || value.facts.some(f => typeof f !== "string") || JSON.stringify(value).length > 4000) throw new Stop("invalid_model_output");
        results.push({ sources: [...value.sources], facts: [...value.facts] });
        await record({ kind: "read", status: "ok", tool: request.name, sources: value.sources });
      }
    }
    throw new Stop("limit_reached");
  } catch (error) {
    const code = error instanceof Stop ? error.code : "provider_failed";
    return finish(code === "cancelled" ? "cancelled" : "handoff", { reason: code });
  } finally { clearTimeout(timer!); controller.abort(); }
}

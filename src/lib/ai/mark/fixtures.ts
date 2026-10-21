import type { DriverContext, SandboxDependencies } from "./engine";
/** Versioned, synthetic facts only. No customer/knowledge database service is imported here. */
export const FIXTURE_FACTS = Object.freeze({ hours: "El negocio de ejemplo abre de lunes a viernes de 9:00 a 18:00.", price: "En el menú de ejemplo, el matcha cuesta $95.", customer: "El cliente ficticio tiene 2 visitas y $150 en compras de ejemplo." });
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
export const fixtureRead: SandboxDependencies["read"] = async request => {
  if (request.name === "customer.summary") return { sources: ["fixture-customer-v1"], facts: [FIXTURE_FACTS.customer] };
  const q = fold(request.input.query);
  if (/horario|abr|hour|open/.test(q)) return { sources: ["fixture-hours-v1"], facts: [FIXTURE_FACTS.hours] };
  if (/matcha|precio|price/.test(q)) return { sources: ["fixture-price-v1"], facts: [FIXTURE_FACTS.price] };
  return { sources: [], facts: [] };
};
/** Deterministic protocol driver, NOT an LLM or a classifier quality claim. Never echoes arbitrary user text. */
export async function fixtureDecision(context: DriverContext): Promise<string> {
  const q = fold(context.question);
  if (/humano|persona|human|refund|reembolso|queja/.test(q)) return JSON.stringify({ action: "handoff", reason: "human_requested" });
  if (context.call === 1) return JSON.stringify({ action: "read", requests: [/visitas|compras|visits|purchases/.test(q) ? { name: "customer.summary", input: {} } : { name: "knowledge.search", input: { query: context.question.slice(0, 120) } }] });
  const facts = context.results.flatMap(r => r.facts), sources = context.results.flatMap(r => r.sources);
  return JSON.stringify(facts.length ? { action: "reply", text: facts.join(" "), sources } : { action: "handoff", reason: "insufficient_information" });
}

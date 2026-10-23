/** Product names only. This catalog does not register or activate agent runtimes. */
export const AGENT_IDENTITIES = [
  { name: "Lía", specialty: "Atención y ventas", specialtyEn: "Customer service and sales" },
  { name: "Sol", specialty: "Soporte", specialtyEn: "Support" },
  { name: "Nodo", specialty: "Operaciones", specialtyEn: "Operations" },
  { name: "Atlas", specialty: "Investigación", specialtyEn: "Research" },
  { name: "Nova", specialty: "Marketing y contenido", specialtyEn: "Marketing and content" },
] as const;

/** Preserve customized names and the immutable keys of deployed pilot instances. */
export function agentDisplayName(definitionKey: string, storedName: string): string {
  return definitionKey === "mark" && storedName === "Mark" ? AGENT_IDENTITIES[0].name : storedName;
}

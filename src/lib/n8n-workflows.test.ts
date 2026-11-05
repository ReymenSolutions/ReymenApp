// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Los flujos de n8n que se entregan en el repo se importan tal cual: un JSON roto, una conexión a un nodo que no existe o
// un nodo de código que no compila solo se descubriría al importarlo en producción.
const DIR = join(process.cwd(), "n8n/workflows");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

type Node = { name: string; type: string; parameters: Record<string, unknown> };
type Workflow = { name: string; nodes: Node[]; connections: Record<string, { main: { node: string }[][] }> };

describe("flujos de n8n del repositorio", () => {
  it.each(files)("%s es importable: conexiones válidas y código que compila", (file) => {
    const wf = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Workflow;
    const names = new Set(wf.nodes.map((n) => n.name));
    expect(names.size).toBe(wf.nodes.length);
    for (const [from, conn] of Object.entries(wf.connections)) {
      expect(names.has(from), `${from} no existe`).toBe(true);
      for (const out of conn.main) for (const to of out) expect(names.has(to.node), `${to.node} no existe`).toBe(true);
    }
    for (const node of wf.nodes.filter((n) => n.type === "n8n-nodes-base.code")) {
      const js = String(node.parameters.jsCode ?? "");
      expect(() => new Function(`return (async function(){\n${js}\n})`), `${node.name} no compila`).not.toThrow();
    }
  });

  it("funcionan en n8n 2.x: sin URLSearchParams y sin leer variables de entorno fuera de un try", () => {
    // En n8n 2.x el código corre aislado: no existe URLSearchParams y $env está bloqueado por defecto
    // (N8N_BLOCK_ENV_ACCESS_IN_NODE). Ambos se descubrieron al probar los flujos en un n8n real.
    for (const file of files) {
      const wf = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Workflow;
      for (const node of wf.nodes.filter((n) => n.type === "n8n-nodes-base.code")) {
        const js = String(node.parameters.jsCode ?? "");
        expect(js, `${file} › ${node.name}`).not.toMatch(/new URLSearchParams|URLSearchParams\(/);
        for (const line of js.split("\n").filter((l) => l.includes("$env"))) expect(line, `${file} › ${node.name}`).toMatch(/try\s*\{/);
      }
    }
  });

  it("no traen secretos reales: solo los textos para pegar", () => {
    for (const file of files) {
      const raw = readFileSync(join(DIR, file), "utf8");
      expect(raw, file).not.toMatch(/\bAC[0-9a-f]{32}\b/); // Account SID real de Twilio
      expect(raw, file).not.toMatch(/\bEAA[A-Za-z0-9]{40,}/); // token de Meta
      expect(raw, file).not.toMatch(/llave:\s*'(?!PEGA_AQUI)[^']{20,}'/);
    }
  });

  it("los webhooks de salida coinciden con los que Reymen llama", async () => {
    const { outboundWorkflowPath } = await import("./channels");
    const paths = files.flatMap((f) => (JSON.parse(readFileSync(join(DIR, f), "utf8")) as Workflow).nodes.filter((n) => n.type === "n8n-nodes-base.webhook").map((n) => n.parameters.path));
    for (const channel of ["whatsapp", "instagram", "messenger"]) expect(paths).toContain(outboundWorkflowPath(channel));
  });
});

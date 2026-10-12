import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "@/lib/i18n";

vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
const enableBlueprint = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/actions/admin/blueprints", () => ({ enableBlueprint: (...a: unknown[]) => enableBlueprint(...a), setBlueprintDryRun: vi.fn(), disableBlueprint: vi.fn() }));
vi.mock("@/actions/admin/automation-config", () => ({ getAutomationConfigForm: vi.fn(), saveAutomationConfig: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ClientAutomationsHub, type LegacyAutomationRow } from "./ClientAutomationsHub";
import type { BlueprintRow } from "@/actions/admin/blueprints";

const bp = (key: string, name: string, trigger: string, instance: BlueprintRow["instance"] = null): BlueprintRow => ({ key, name, description: `Descripción de ${name}`, version: 1, trigger, requiredModules: ["Reymen POS"], overlaps: [], instance });
const inst = (over: Partial<NonNullable<BlueprintRow["instance"]>> = {}) => ({ id: "i1", status: "ACTIVE", dryRun: true, lastRunAt: null, lastStatus: null, counts: {}, ...over });
const blueprints = [
  bp("recovery", "Recuperación de clientes", "customer.at_risk", inst()),
  bp("birthday", "Campaña de cumpleaños", "customer.birthday"),
  bp("welcome", "Bienvenida", "customer.created", inst({ id: "i3", dryRun: false })),
  bp("vip", "Aviso de cliente VIP", "customer.vip", inst({ id: "i4", status: "PAUSED" })),
];
const legacy: LegacyAutomationRow[] = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, name: `Plantilla ${String(i + 1).padStart(2, "0")}`, type: i % 2 ? "appointments" : "lead_capture", status: "ACTIVE", n8nWorkflowId: null, lastRunAt: null, configurable: i === 0 }));

const setup = () => render(<ClientAutomationsHub orgId="org1" blueprints={blueprints} legacy={legacy} />);
const rows = () => screen.getAllByRole("listitem").filter((li) => li.querySelector("[aria-expanded]"));

describe("ClientAutomationsHub", () => {
  it("una lista compacta y paginada, con el total y las pestañas con su conteo", () => {
    setup();
    expect(screen.getByText("14 en total")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Todas/ })).toHaveTextContent("14");
    expect(screen.getByRole("tab", { name: /Inteligentes/ })).toHaveTextContent("4");
    expect(screen.getByRole("tab", { name: /Plantillas n8n/ })).toHaveTextContent("10");
    expect(rows()).toHaveLength(8); // una página
    expect(screen.getByText("1–8 de 14")).toBeInTheDocument();
  });

  it("la paginación recorre todo sin perder nada", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("9–14 de 14")).toBeInTheDocument();
    expect(rows()).toHaveLength(6);
    await userEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("1–8 de 14")).toBeInTheDocument();
  });

  it("se busca escribiendo, sin acentos ni mayúsculas, por nombre, tipo, disparador o estado", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox"), "recuperacion");
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Recuperación de clientes")).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "customer.birthday");
    expect(rows()).toHaveLength(1);
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "sin habilitar");
    expect(screen.getByText("Campaña de cumpleaños")).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "no existe esto");
    expect(screen.getByText("Ninguna automatización coincide con tu búsqueda.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros", hidden: false }));
    expect(rows()).toHaveLength(8);
  });

  it("las pestañas separan inteligentes y plantillas; los filtros de estado y tipo también se pueden escribir", async () => {
    setup();
    await userEvent.click(screen.getByRole("tab", { name: /Inteligentes/ }));
    expect(rows()).toHaveLength(4);
    // Filtro de estado con búsqueda: escribir "paus" encuentra "Pausada".
    const state = screen.getByRole("combobox", { name: "Estado" });
    await userEvent.type(state, "paus");
    await userEvent.click(within(screen.getByRole("listbox", { name: "Estado" })).getByRole("option", { name: "Pausada" }));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Aviso de cliente VIP")).toBeInTheDocument();
    // Filtro por tipo/disparador, también escribiendo.
    await userEvent.click(screen.getByRole("button", { name: "Todos" }));
    await userEvent.click(screen.getByRole("tab", { name: /Plantillas n8n/ }));
    await userEvent.type(screen.getByRole("combobox", { name: "Tipo o disparador" }), "appoint");
    await userEvent.click(screen.getByRole("option", { name: "appointments" }));
    expect(rows()).toHaveLength(5);
  });

  it("cada fila muestra su estado y la acción principal; el detalle y lo secundario se despliegan", async () => {
    setup();
    const birthday = screen.getByText("Campaña de cumpleaños").closest("li")!;
    expect(within(birthday).getByText("Sin habilitar")).toBeInTheDocument();
    await userEvent.click(within(birthday).getByRole("button", { name: "Habilitar" }));
    expect(enableBlueprint).toHaveBeenCalledWith({ orgId: "org1", key: "birthday" });
    const recovery = screen.getByText("Recuperación de clientes").closest("li")!;
    expect(within(recovery).getByText("Simulación")).toBeInTheDocument();
    expect(within(recovery).queryByText("Descripción de Recuperación de clientes")).toBeNull(); // el detalle empieza cerrado
    await userEvent.click(within(recovery).getByRole("button", { name: /Detalles: Recuperación/ }));
    expect(within(recovery).getByText("Descripción de Recuperación de clientes")).toBeInTheDocument();
    expect(within(recovery).getByRole("button", { name: "Pasar a envío real" })).toBeInTheDocument();
    expect(within(recovery).getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    // Solo las plantillas con parámetros declarados tienen "Configurar".
    const t1 = screen.getByText("Plantilla 01").closest("li")!;
    expect(within(t1).getByRole("button", { name: "Configurar" })).toBeInTheDocument();
    expect(within(screen.getByText("Plantilla 02").closest("li")!).queryByRole("button", { name: "Configurar" })).toBeNull();
  });
});

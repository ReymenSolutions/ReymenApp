import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "@/lib/i18n";

vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const updatePlan = vi.fn().mockResolvedValue({ success: true });
const createPlan = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/actions/admin/plans", () => ({ updatePlan: (...a: unknown[]) => updatePlan(...a), createPlan: (...a: unknown[]) => createPlan(...a) }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a) } }));

import { PlanEditorDialog } from "./PlanEditorDialog";
import type { PlanRow } from "@/actions/admin/plans";

const plan: PlanRow = { key: "professional", name: "Professional", nameEn: "Professional", description: "", descriptionEn: "", priceMxn: 1999, limits: { leads: 5000, users: 10, automations: 10 }, aiBudgetMxn: 200, maxAiAgents: 3, modules: ["CRM", "AUTOMATIONS"], features: [{ es: "3 agentes IA activos", en: "3 active AI agents" }], stripePriceId: null, sortOrder: 1, isActive: true, version: 3, clients: 4, revisions: [] };

describe("PlanEditorDialog", () => {
  beforeEach(() => { updatePlan.mockClear(); createPlan.mockClear(); toast.success.mockClear(); });

  it("edita el nombre, el precio, un límite ilimitado y 'qué incluye', y avisa a cuántos clientes aplica", async () => {
    render(<PlanEditorDialog plan={plan} />);
    await userEvent.click(screen.getByRole("button", { name: /Editar/ }));
    expect(screen.getByText(/aplica de inmediato a los 4 cliente\(s\)/)).toBeInTheDocument();
    const price = screen.getByLabelText("Precio mensual (MXN)");
    await userEvent.clear(price);
    await userEvent.type(price, "2199");
    await userEvent.clear(screen.getByLabelText("Nombre (español)"));
    await userEvent.type(screen.getByLabelText("Nombre (español)"), "Pro");
    // "Ilimitadas" para automatizaciones vacía el campo (null = sin tope).
    await userEvent.click(screen.getByRole("checkbox", { name: /Ilimitadas/ }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
    await userEvent.type(screen.getByLabelText("Texto en español 2"), "Soporte prioritario");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(updatePlan).toHaveBeenCalledTimes(1);
    const [key, body] = updatePlan.mock.calls[0];
    expect(key).toBe("professional");
    expect(body).toMatchObject({ name: "Pro", priceMxn: "2199", maxAutomations: "", maxLeads: "5000", maxAiAgents: "3", modules: ["CRM", "AUTOMATIONS"] });
    expect(body.features).toEqual([{ es: "3 agentes IA activos", en: "3 active AI agents" }, { es: "Soporte prioritario", en: "Soporte prioritario" }]);
    expect(toast.success).toHaveBeenCalled();
  });

  it("un plan nuevo pide su llave y no cambia a nadie", async () => {
    render(<PlanEditorDialog />);
    await userEvent.click(screen.getByRole("button", { name: /Nuevo plan/ }));
    expect(screen.getByText("Un plan nuevo no cambia a ningún cliente existente.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Llave/), "premium");
    await userEvent.type(screen.getByLabelText("Nombre (español)"), "Premium");
    await userEvent.type(screen.getByLabelText("Precio mensual (MXN)"), "5999");
    await userEvent.type(screen.getByLabelText("Presupuesto interno de IA (MXN/mes)"), "900");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ key: "premium", name: "Premium", priceMxn: "5999", aiBudgetMxn: "900" }));
  });
});

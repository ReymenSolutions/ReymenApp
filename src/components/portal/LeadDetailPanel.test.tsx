import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "@/lib/i18n";

vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
const getLeadPanel = vi.fn();
vi.mock("@/actions/lead-panel", () => ({ getLeadPanel: (...a: unknown[]) => getLeadPanel(...a) }));
const createNote = vi.fn();
vi.mock("@/actions/notes", () => ({ createNote: (...a: unknown[]) => createNote(...a) }));
vi.mock("@/actions/opportunities", () => ({ moveOpportunityStage: vi.fn() }));
vi.mock("@/actions/leads", () => ({ updateLeadStatus: vi.fn(), updateLeadTags: vi.fn() }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a) } }));

import { LeadDetailPanel } from "./LeadDetailPanel";

const panelData = {
  lead: { id: "l1", name: "Ana Torres", email: "ana@correo.com", phone: "5551234567", status: "NEW", source: "whatsapp", tags: [], doNotContact: false, createdAt: new Date("2026-10-01"), notes: null },
  opportunities: [{ id: "o1", title: "Plan anual", amount: 12000, currency: "MXN", stageId: "s1", stageName: "Nuevo", ownerName: "Luis", estimatedCloseDate: null }],
  stages: [{ id: "s1", name: "Nuevo" }],
  timeline: { events: [{ type: "created", date: new Date("2026-10-01"), source: "whatsapp" }], hasMore: false },
  canManageOpps: false,
  canUpdateStatus: false,
  me: "Reymen Tester",
};

describe("LeadDetailPanel", () => {
  beforeEach(() => {
    getLeadPanel.mockReset();
    createNote.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    getLeadPanel.mockResolvedValue(panelData);
  });

  it("muestra un skeleton mientras carga y luego el contacto, sus oportunidades y su actividad", async () => {
    render(<LeadDetailPanel leadId="l1" onClose={() => {}} />);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByText("Ana Torres")).toBeInTheDocument();
    expect(screen.getByText("ana@correo.com")).toBeInTheDocument();
    expect(screen.getByText("Plan anual")).toBeInTheDocument();
    expect(screen.getByText(/Llegó por whatsapp/)).toBeInTheDocument();
    expect(getLeadPanel).toHaveBeenCalledWith("l1");
  });

  it("si no carga ofrece reintentar", async () => {
    getLeadPanel.mockRejectedValueOnce(new Error("x"));
    render(<LeadDetailPanel leadId="l1" onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByText("Ana Torres")).toBeInTheDocument();
  });

  it("al guardar una nota la inserta al inicio de la actividad y confirma", async () => {
    createNote.mockResolvedValue({ success: true, noteId: "n1" });
    render(<LeadDetailPanel leadId="l1" onClose={() => {}} />);
    await screen.findByText("Ana Torres");
    const box = screen.getByPlaceholderText("Agrega una nota…");
    await userEvent.type(box, "Llamar mañana");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Nota guardada"));
    expect(createNote).toHaveBeenCalledWith({ leadId: "l1", content: "Llamar mañana" });
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Llamar mañana");
    expect(items[0]).toHaveTextContent("Reymen Tester");
    expect(box).toHaveValue("");
  });

  it("si falla el guardado conserva el texto y avisa", async () => {
    createNote.mockRejectedValue(new Error("boom"));
    render(<LeadDetailPanel leadId="l1" onClose={() => {}} />);
    await screen.findByText("Ana Torres");
    const box = screen.getByPlaceholderText("Agrega una nota…");
    await userEvent.type(box, "No se pierde");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(box).toHaveValue("No se pierde");
    expect(screen.queryByText(/Nota de Reymen Tester/)).not.toBeInTheDocument();
  });

  it("Escape cierra el panel", async () => {
    const onClose = vi.fn();
    render(<LeadDetailPanel leadId="l1" onClose={onClose} />);
    await screen.findByText("Ana Torres");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

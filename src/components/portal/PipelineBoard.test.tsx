import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "@/lib/i18n";

vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
const moveOpportunityStage = vi.fn();
vi.mock("@/actions/opportunities", () => ({ moveOpportunityStage: (...a: unknown[]) => moveOpportunityStage(...a) }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a) } }));
vi.mock("@/components/portal/LeadDetailPanel", () => ({ LeadDetailPanel: ({ leadId }: { leadId: string | null }) => (leadId ? <div role="dialog">panel {leadId}</div> : null) }));

import { PipelineBoard, type BoardOpportunity, type BoardStage } from "./PipelineBoard";

const stages: BoardStage[] = [
  { id: "s1", name: "Nuevo", isWon: false, isLost: false },
  { id: "s2", name: "Propuesta", isWon: false, isLost: false },
  { id: "s3", name: "Ganado", isWon: true, isLost: false },
];
const opp = (id: string, stageId: string, extra: Partial<BoardOpportunity> = {}): BoardOpportunity => ({
  id,
  title: `Trato ${id}`,
  amount: 1000,
  currency: "MXN",
  estimatedCloseDate: null,
  leadId: `lead-${id}`,
  leadName: `Contacto ${id}`,
  ownerName: "Ana Pérez",
  tags: [],
  stageId,
  ...extra,
});
const opportunities = [opp("a", "s1", { amount: 1500 }), opp("b", "s1", { amount: 500 }), opp("c", "s2", { amount: 3000, tags: ["prioridad"] })];

const column = (name: string) => screen.getByRole("region", { name });

describe("PipelineBoard", () => {
  beforeEach(() => {
    moveOpportunityStage.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("muestra cada etapa con su cantidad y su total, y las tarjetas con sus datos", () => {
    render(<PipelineBoard stages={stages} opportunities={opportunities} canManage />);
    expect(within(column("Nuevo")).getByRole("heading", { name: "Nuevo" })).toBeInTheDocument();
    expect(within(column("Nuevo")).getByText("2")).toBeInTheDocument();
    expect(within(column("Nuevo")).getByText("$2,000", { selector: "[aria-hidden]" })).toBeInTheDocument();
    expect(within(column("Propuesta")).getByText("prioridad")).toBeInTheDocument();
    expect(within(column("Ganado")).getByText("Sin oportunidades")).toBeInTheDocument();
  });

  it("cambia de etapa sin arrastrar y guarda con la acción existente", async () => {
    moveOpportunityStage.mockResolvedValue({ success: true });
    render(<PipelineBoard stages={stages} opportunities={opportunities} canManage />);
    await userEvent.click(screen.getByRole("button", { name: /Mover a… Trato a/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Propuesta" }));
    expect(moveOpportunityStage).toHaveBeenCalledWith("a", "s2");
    expect(within(column("Propuesta")).getByText("Trato a")).toBeInTheDocument();
    expect(within(column("Nuevo")).queryByText("Trato a")).not.toBeInTheDocument();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("si el guardado falla, la tarjeta vuelve a su etapa y se muestra un mensaje claro", async () => {
    moveOpportunityStage.mockRejectedValue(new Error("boom"));
    render(<PipelineBoard stages={stages} opportunities={opportunities} canManage />);
    await userEvent.click(screen.getByRole("button", { name: /Mover a… Trato a/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Ganado" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("volvió a su etapa"), expect.anything()));
    expect(within(column("Nuevo")).getByText("Trato a")).toBeInTheDocument();
    expect(within(column("Ganado")).queryByText("Trato a")).not.toBeInTheDocument();
  });

  it("sin permiso de gestionar no hay menú de mover ni se puede arrastrar", () => {
    render(<PipelineBoard stages={stages} opportunities={opportunities} canManage={false} />);
    expect(screen.queryByRole("button", { name: /Mover a…/ })).not.toBeInTheDocument();
    expect(moveOpportunityStage).not.toHaveBeenCalled();
  });

  it("hacer clic en una tarjeta abre el panel de ese contacto", async () => {
    render(<PipelineBoard stages={stages} opportunities={opportunities} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir detalle: Trato c" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("panel lead-c");
  });
});

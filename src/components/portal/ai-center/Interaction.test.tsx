import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserError } from "@/lib/user-error";
import { strings } from "@/lib/i18n";
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const update = vi.fn(), legacy = vi.fn(), list = vi.fn(), test = vi.fn();
vi.mock("@/actions/ai-agents", () => ({ updateLegacyAgent: (...a: unknown[]) => update(...a), listAgentInstances: () => list() }));
vi.mock("@/actions/whatsapp-assistant", () => ({ upsertWhatsAppAssistant: (...a: unknown[]) => legacy(...a) }));
vi.mock("@/actions/agent", () => ({ testAgentReply: (...a: unknown[]) => test(...a) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { AgentNameForm } from "./NameForm";
import { AgentTester } from "../AgentTester";
import { AiCenterError } from "./Error";

describe("Phase 2 safe interaction states", () => {
  beforeEach(() => { update.mockReset(); legacy.mockReset(); list.mockReset(); test.mockReset(); });
  it("failed versioned save keeps user input and retries with freshly reviewed metadata", async () => {
    update.mockRejectedValueOnce(new UserError("La configuración cambió; recarga antes de guardar")).mockResolvedValueOnce({ id: "own", configVersion: 3, sourceHash: "new" });
    list.mockResolvedValue({ instance: { id: "own", configVersion: 2 }, source: { sourceHash: "latest", publicName: "Nombre de otra persona" } });
    render(<AgentNameForm initialName="Sofía" version={{ id: "own", expectedVersion: 1, expectedHash: "old" }} />);
    await userEvent.clear(screen.getByLabelText("Nombre que verá tu cliente")); await userEvent.type(screen.getByLabelText("Nombre que verá tu cliente"), "Mi nombre");
    await userEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("configuración cambió");
    expect(screen.getByLabelText("Nombre que verá tu cliente")).toHaveValue("Mi nombre");
    await userEvent.click(screen.getByRole("button", { name: "Recargar datos" }));
    expect(await screen.findByText(/Nombre de otra persona/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ id: "own", expectedVersion: 2, expectedHash: "latest", publicName: "Mi nombre" }));
    expect(legacy).not.toHaveBeenCalled();
  });
  it("unknown transport failures show a localized message without leaking technical details", async () => {
    legacy.mockRejectedValue(new Error("private-provider-or-transport-details"));
    render(<AgentNameForm initialName="Sofía" version={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar. Conservamos lo que escribiste.");
    expect(screen.queryByText("private-provider-or-transport-details")).not.toBeInTheDocument();
  });
  it("requires usage acknowledgement and ignores a late result after reset", async () => {
    let resolve!: (r: { action: string; reply: string }) => void;
    test.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<AgentTester aiConfigured notConfiguredText="Unavailable" plainLanguage />);
    await userEvent.type(screen.getByRole("textbox", { name: "Mensaje de prueba" }), "Horario?");
    expect(screen.getByRole("button", { name: "Probar" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox")); await userEvent.click(screen.getByRole("button", { name: "Probar" }));
    await waitFor(() => expect(test).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Empezar de nuevo" }));
    await act(async () => { resolve({ action: "reply", reply: "Respuesta anterior" }); });
    await waitFor(() => expect(screen.queryByText("Respuesta anterior")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Mensaje de prueba" })).toHaveValue("");
  });
  it("error boundary offers recovery without displaying provider errors or fake metrics", async () => {
    const reset = vi.fn(); render(<AiCenterError error={new Error("private-provider-error")} reset={reset} />);
    expect(screen.queryByText("private-provider-error")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" })); expect(reset).toHaveBeenCalledTimes(1);
  });
});

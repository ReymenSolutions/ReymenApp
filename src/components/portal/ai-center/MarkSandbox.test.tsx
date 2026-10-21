import { describe, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const start = vi.fn(), execute = vi.fn(), stop = vi.fn(), read = vi.fn();
vi.mock("@/actions/mark-sandbox", () => ({ startMarkSandbox: (...a: unknown[]) => start(...a), runMarkSandboxPreview: (...a: unknown[]) => execute(...a), stopMarkSandbox: (...a: unknown[]) => stop(...a), getMarkSandbox: (...a: unknown[]) => read(...a) }));
import { MarkSandbox } from "./MarkSandbox";
const queued = { id: "own-run", status: "QUEUED", trace: [], result: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) };
const complete = { ...queued, status: "SUCCEEDED", trace: [{ number: 1, kind: "decision", status: "ok" }], result: { reply: "Respuesta ficticia devuelta.", outcome: "reply", providerCalls: 0 } };
beforeEach(() => { start.mockReset().mockResolvedValue(queued); execute.mockReset().mockResolvedValue(complete); stop.mockReset().mockResolvedValue({ ...queued, status: "CANCELLED" }); read.mockReset().mockResolvedValue(complete); });
describe("Mark sandbox interaction and stale response protection", () => {
  it("labels synthetic data honestly and submits only simulation permissions", async () => {
    render(<MarkSandbox lang="es" />); expect(screen.getByText(/No evalúa un modelo ni una conexión real/)).toBeVisible();
    await userEvent.click(screen.getByLabelText("Consultar compras del cliente ficticio"));
    await userEvent.click(screen.getByRole("button", { name: "Probar Mark" }));
    expect(await screen.findByText("Respuesta ficticia devuelta.")).toBeVisible();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ mode: "simulation", permissions: { knowledge: true, customer: true } }), expect.any(String));
    expect(screen.getByText(/Sin mensajes enviados/)).toBeVisible();
  });
  it("ignores a late completed response after reset and calls cancellation", async () => {
    let finish!: (value: typeof complete) => void; execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<MarkSandbox lang="es" />); await userEvent.click(screen.getByRole("button", { name: "Probar Mark" })); await waitFor(() => expect(execute).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Detener y limpiar" })); await waitFor(() => expect(stop).toHaveBeenCalledWith("own-run"));
    await act(async () => { finish(complete); });
    expect(screen.queryByText("Respuesta ficticia devuelta.")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Probar Mark" })).toBeEnabled();
  });
  it("cancels an admission that arrives after reset without starting execution", async () => {
    let finish!: (value: typeof queued) => void; start.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<MarkSandbox lang="en" />); await userEvent.click(screen.getByRole("button", { name: "Test Mark" })); await userEvent.click(screen.getByRole("button", { name: "Stop and clear" }));
    await act(async () => { finish(queued); });
    expect(stop).toHaveBeenCalledWith("own-run"); expect(execute).not.toHaveBeenCalled();
  });
  it("keeps input and retrieves a durable outcome after a transport error without replaying execution", async () => {
    execute.mockRejectedValue(new Error("private-transport-token"));
    render(<MarkSandbox lang="es" />); await userEvent.click(screen.getByRole("button", { name: "Probar Mark" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("private-transport-token"); expect(screen.getByLabelText("Pregunta de prueba")).toHaveValue("¿Cuál es el horario?");
    await userEvent.click(screen.getByRole("button", { name: "Consultar estado" })); expect(await screen.findByText("Respuesta ficticia devuelta.")).toBeVisible();
    expect(read).toHaveBeenCalledWith("own-run"); expect(execute).toHaveBeenCalledTimes(1); expect(start).toHaveBeenCalledTimes(1);
  });
});

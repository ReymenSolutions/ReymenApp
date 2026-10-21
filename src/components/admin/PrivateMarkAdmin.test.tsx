import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PrivateMarkAdmin } from "./PrivateMarkAdmin";
import type { PrivatePilotAdminView } from "@/lib/ai/pilot/admin";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), pause: vi.fn(), close: vi.fn(), reconcile: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/actions/mark-pilot-admin", () => ({ preparePrivateMarkAction: mocks.prepare, pausePrivateMarkAction: mocks.pause, closePrivateMarkRootAction: mocks.close, reconcilePrivateMarkAction: mocks.reconcile }));
const base: PrivatePilotAdminView = {
  organizations: [{ id: "test-business", name: "Reymen Piloto" }], organization: { id: "test-business", name: "Reymen Piloto", moduleEnabled: true },
  instance: null, policy: null, pending: [], pendingCount: 0, roots: [], budget: { availableMxn: 500, remainingMxn: 500, reservedMxn: 0, spentMxn: 0 },
};
beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset().mockResolvedValue(undefined); });
it("prepares a paused instance without presenting an activation or paid-call control", async () => {
  render(<PrivateMarkAdmin view={base} lang="es" page={0} />);
  expect(screen.getByText(/no llama a Anthropic/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Preparar Mark pausado" }));
  await waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith({ organizationId: "test-business" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: /activar|cobrar/i })).not.toBeInTheDocument();
  expect(mocks.reconcile).not.toHaveBeenCalled();
});
it("shows an empty business state and disables preparation without the module", () => {
  const { rerender } = render(<PrivateMarkAdmin view={{ organizations: [], organization: null, instance: null, policy: null, pending: [], pendingCount: 0, roots: [], budget: null }} lang="en" page={0} />);
  expect(screen.getByText("No test businesses are available yet.")).toBeVisible();
  rerender(<PrivateMarkAdmin view={{ ...base, organization: { ...base.organization!, moduleEnabled: false } }} lang="en" page={0} />);
  expect(screen.getByRole("button", { name: "Prepare paused Mark" })).toBeDisabled();
});
it("requires reviewed evidence and sends an explicit no-charge outcome without an automatic retry", async () => {
  const view = { ...base, pendingCount: 1, pending: [{ id: "usage-fixture", pilotRootId: "root-fixture", pilotStep: 1, model: "test-model", createdAt: "2026-10-21T12:00:00.000Z", pilotEstimateMxn: "0.1" }] };
  render(<PrivateMarkAdmin view={view} lang="es" page={0} />);
  fireEvent.click(screen.getByText(/Llamada 1/));
  fireEvent.change(screen.getByLabelText("Qué confirma el proveedor"), { target: { value: "PROVIDER_NO_CHARGE" } });
  fireEvent.change(screen.getByLabelText(/Referencia del comprobante/), { target: { value: "reviewed-proof" } });
  fireEvent.change(screen.getByLabelText(/ID de Anthropic/), { target: { value: "req_fixture" } });
  const confirm = screen.getByRole("checkbox"); expect(confirm).toBeRequired();
  expect(mocks.reconcile).not.toHaveBeenCalled();
  fireEvent.click(confirm); fireEvent.click(screen.getByRole("button", { name: "Guardar conciliación" }));
  await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({ usageId: "usage-fixture", confirmEvidence: true, evidence: expect.objectContaining({ kind: "PROVIDER_NO_CHARGE", outcome: "FAILED", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } }) })));
  expect(mocks.reconcile).toHaveBeenCalledTimes(1);
});

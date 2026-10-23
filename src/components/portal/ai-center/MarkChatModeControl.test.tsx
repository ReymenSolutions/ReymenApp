import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/actions/mark-private-chat", () => ({ setMarkChatMode: mocks.save }));
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es" }) }));
import { MarkChatModeControl } from "./MarkChatModeControl";
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue({ mode: "AUTO", version: 4 }); });
it("requires explicit consent before enabling autonomous replies and sends the expected revision", async () => {
  render(<MarkChatModeControl initial={{ mode: "SUGGEST", version: 3, canManage: true }} />);
  fireEvent.change(screen.getByLabelText("Modo de Lía"), { target: { value: "AUTO" } });
  const button = screen.getByRole("button", { name: "Guardar modo de Lía" }); expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ mode: "AUTO", version: 3, confirmCost: true, confirmFictional: true }));
});
it("keeps the selected mode and shows an error if the server rejects the update", async () => {
  mocks.save.mockRejectedValue(new Error("stale")); render(<MarkChatModeControl initial={{ mode: "SUGGEST", version: 1, canManage: true }} />);
  fireEvent.change(screen.getByLabelText("Modo de Lía"), { target: { value: "OFF" } }); fireEvent.click(screen.getByRole("button", { name: "Guardar modo de Lía" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar"); expect(screen.getByLabelText("Modo de Lía")).toHaveValue("OFF");
});
it("read-only users cannot change the mode", () => {
  render(<MarkChatModeControl initial={{ mode: "SUGGEST", version: 0, canManage: false }} />);
  expect(screen.getByLabelText("Modo de Lía")).toBeDisabled(); expect(screen.queryByRole("button", { name: "Guardar modo de Lía" })).not.toBeInTheDocument();
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), generate: vi.fn(), reply: vi.fn(), control: vi.fn() }));
vi.mock("@/actions/mark-private-chat", () => ({ getMarkChat: mocks.get, generateMarkChat: mocks.generate, replyMarkChat: mocks.reply, controlMarkChat: mocks.control, recoverMarkChat: vi.fn(), renewMarkChatLink: vi.fn() }));
import { MarkChatReviewPanel } from "./MarkChatReviewPanel";
const state = { status: "OPEN", aiHandled: true, active: true, canGenerate: true, canReply: true, inboundId: "inbound-1", messages: [], turn: null };
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(state); mocks.generate.mockResolvedValue({ success: true }); });
afterEach(() => vi.useRealTimers());
it("requires explicit cost confirmation for the displayed customer turn", async () => {
  render(<MarkChatReviewPanel conversationId="private-chat" />);
  const button = await screen.findByRole("button", { name: "Generar borrador de Lía" }); expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /autorizo el costo/ })); fireEvent.click(button);
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({ conversationId: "private-chat", basedOnMessageId: "inbound-1", confirmCost: true, confirmFictional: true }));
  expect(mocks.reply).not.toHaveBeenCalled();
});
it("a newly polled message cannot reuse the previous message's cost confirmation", async () => {
  vi.useFakeTimers(); render(<MarkChatReviewPanel conversationId="private-chat" />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("checkbox", { name: /autorizo el costo/ }));
  mocks.get.mockResolvedValue({ ...state, inboundId: "inbound-2" });
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(screen.getByRole("checkbox", { name: /autorizo el costo/ })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Generar borrador de Lía" })).toBeDisabled(); expect(mocks.generate).not.toHaveBeenCalled();
});
it("a ready draft cannot send until a person explicitly approves its reviewed text", async () => {
  mocks.get.mockResolvedValue({ ...state, turn: { draftId: "draft-1", status: "READY", content: "Horario ficticio", costMxn: "0.01", sources: [], createdAt: new Date().toISOString() } });
  render(<MarkChatReviewPanel conversationId="private-chat" />);
  const button = await screen.findByRole("button", { name: "Aprobar y enviar al visitante" }); expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Borrador para revisar y editar"), { target: { value: "Horario revisado" } });
  fireEvent.click(screen.getAllByRole("checkbox", { name: /Revisé el texto/ })[0]); fireEvent.click(button);
  await waitFor(() => expect(mocks.reply).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "private-chat", draftId: "draft-1", content: "Horario revisado" })));
  expect(mocks.generate).not.toHaveBeenCalled();
});

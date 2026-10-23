import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), generate: vi.fn(), reply: vi.fn(), control: vi.fn() }));
vi.mock("@/actions/mark-private-chat", () => ({ getMarkChat: mocks.get, generateMarkChat: mocks.generate, replyMarkChat: mocks.reply, controlMarkChat: mocks.control, recoverMarkChat: vi.fn(), renewMarkChatLink: vi.fn(), setMarkChatMode: vi.fn() }));
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es" }) }));
import { MarkChatReviewPanel } from "./MarkChatReviewPanel";
const state = { mode: "SUGGEST", modeVersion: 0, humanRequest: false, status: "OPEN", aiHandled: true, active: true, canGenerate: true, canReply: true, inboundId: "inbound-1", messages: [], turn: null };
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
it("requesting an AI recommendation under human control requires consent and never sends automatically", async () => {
  mocks.get.mockResolvedValue({ ...state, aiHandled: false }); render(<MarkChatReviewPanel conversationId="private-chat" />);
  await screen.findByText("Escribir una respuesta humana", { exact: true }); fireEvent.click(screen.getByText("Escribir una respuesta humana", { exact: true }));
  const button = await screen.findByRole("button", { name: "Utilizar respuesta recomendada por IA" }); expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /acepto el consumo de esta recomendación/ })); fireEvent.click(button);
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ humanRequested: true, basedOnMessageId: "inbound-1", confirmCost: true })));
  expect(mocks.reply).not.toHaveBeenCalled();
});
it("a ready recommendation can be inserted or replaced by free text and still needs approval", async () => {
  mocks.get.mockResolvedValue({ ...state, aiHandled: false, turn: { draftId: "human-draft", status: "READY", humanRequested: true, content: "Horario recomendado", costMxn: "0.01", sources: [], createdAt: new Date().toISOString() } });
  render(<MarkChatReviewPanel conversationId="private-chat" />);
  await screen.findByText("Escribir una respuesta humana", { exact: true }); fireEvent.click(screen.getByText("Escribir una respuesta humana", { exact: true }));
  fireEvent.click(await screen.findByRole("button", { name: "Utilizar respuesta recomendada por IA" }));
  expect(screen.getByLabelText("Respuesta humana")).toHaveValue("Horario recomendado"); expect(mocks.reply).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Enviar respuesta humana" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Escribir texto libre" })); expect(screen.getByLabelText("Respuesta humana")).toHaveValue("");
});
it("a newly available recommendation does not overwrite the human's unsent text", async () => {
  vi.useFakeTimers(); mocks.get.mockResolvedValue({ ...state, aiHandled: false }); render(<MarkChatReviewPanel conversationId="private-chat" />); await act(async () => {});
  fireEvent.click(screen.getByText("Escribir una respuesta humana", { exact: true }));
  fireEvent.change(screen.getByLabelText("Respuesta humana"), { target: { value: "Texto humano sin enviar" } });
  mocks.get.mockResolvedValue({ ...state, aiHandled: false, turn: { draftId: "new-rec", status: "READY", humanRequested: true, content: "Propuesta nueva de IA", costMxn: "0.01", sources: [], createdAt: new Date().toISOString() } });
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(screen.getByLabelText("Respuesta humana")).toHaveValue("Texto humano sin enviar"); expect(mocks.reply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Utilizar respuesta recomendada por IA" })); expect(screen.getByLabelText("Respuesta humana")).toHaveValue("Propuesta nueva de IA");
});

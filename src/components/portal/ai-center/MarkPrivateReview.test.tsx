import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MarkPrivateReview } from "./MarkPrivateReview";
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@/actions/mark-private-review", () => ({ testPrivateMark: mocks.call }));
beforeEach(() => { mocks.call.mockReset(); });
function accept() {
  fireEvent.change(screen.getByLabelText("Pregunta ficticia"), { target: { value: "horario ficticio" } });
  for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
}
it("requires fictional information and cost acceptance before submitting", async () => {
  mocks.call.mockResolvedValue({ kind: "no_sources", text: "", sources: [] });
  render(<MarkPrivateReview />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Probar con Anthropic" })).toBeDisabled());
  accept(); fireEvent.click(screen.getByRole("button", { name: "Probar con Anthropic" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No se llamó a Anthropic"));
  expect(mocks.call).toHaveBeenCalledTimes(1);
  expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({ question: "horario ficticio", confirmFictional: true, confirmCost: true, requestKey: expect.any(String) }));
});
it("does not retry an ambiguous failure and requires explicit preparation for another test", async () => {
  mocks.call.mockRejectedValue(new Error("synthetic failure")); render(<MarkPrivateReview />); accept();
  fireEvent.click(screen.getByRole("button", { name: "Probar con Anthropic" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se repetirá"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Probar con Anthropic" })).toBeDisabled());
  expect(mocks.call).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Preparar otra prueba" }));
  expect(screen.getAllByRole("checkbox").every(box => !(box as HTMLInputElement).checked)).toBe(true);
  expect(mocks.call).toHaveBeenCalledTimes(1);
});
it("renders generated content as plain text for human review and never offers delivery", async () => {
  mocks.call.mockResolvedValue({ kind: "draft", text: "<script>bad()</script>", costMxn: "0.01", sources: [{ articleId: "fixture", title: "Horario", version: 1 }] });
  const { container } = render(<MarkPrivateReview />); accept(); fireEvent.click(screen.getByRole("button", { name: "Probar con Anthropic" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("requiere revisión humana"));
  expect(screen.getByRole("status")).toHaveTextContent("<script>bad()</script>"); expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("button", { name: /enviar/i })).not.toBeInTheDocument();
});

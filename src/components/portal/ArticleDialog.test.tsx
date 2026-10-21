import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KnowledgeBase } from "@prisma/client";
import { UserError } from "@/lib/user-error";
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es" }) }));
const update = vi.fn(), toastError = vi.fn();
vi.mock("@/actions/knowledge-base", () => ({ createArticle: vi.fn(), updateArticle: (...args: unknown[]) => update(...args) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));
import { ArticleDialog } from "./ArticleDialog";
const article: KnowledgeBase = { id: "source", organizationId: "own", title: "Horario", content: "Versión que revisé", category: "FAQ", tags: ["visita"], isActive: true, knowledgeVersion: 1, createdAt: new Date(), updatedAt: new Date() };
describe("article edits bind the reviewed form to its version", () => {
  it("keeps the original version during background refresh and reviews fresh data on reopen", async () => {
    update.mockRejectedValueOnce(new UserError("El artículo cambió; actualiza antes de guardar")).mockResolvedValueOnce({ success: true });
    const view = render(<ArticleDialog mode="edit" article={article} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar artículo: Horario" }));
    await userEvent.clear(screen.getByLabelText("Contenido *")); await userEvent.type(screen.getByLabelText("Contenido *"), "Mi edición pendiente");
    const newer = { ...article, content: "Cambio de otra persona", knowledgeVersion: 2 };
    view.rerender(<ArticleDialog mode="edit" article={newer} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("source", expect.objectContaining({ content: "Mi edición pendiente", expectedVersion: 1, tags: ["visita"] })));
    expect(screen.getByLabelText("Contenido *")).toHaveValue("Mi edición pendiente");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar artículo: Horario" }));
    expect(screen.getByLabelText("Contenido *")).toHaveValue("Cambio de otra persona");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith("source", expect.objectContaining({ content: newer.content, expectedVersion: 2 })));
  });
});

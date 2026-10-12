import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "@/lib/i18n";

let language: "es" | "en" = "es";
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: language, t: strings[language] }) }));
const requestReplyDraft = vi.fn();
const regenerateReplyDraft = vi.fn();
const dismissReplyDraft = vi.fn();
vi.mock("@/actions/ai-drafts", () => ({
  requestReplyDraft: (...a: unknown[]) => requestReplyDraft(...a),
  regenerateReplyDraft: (...a: unknown[]) => regenerateReplyDraft(...a),
  dismissReplyDraft: (...a: unknown[]) => dismissReplyDraft(...a),
}));
const sendManualMessage = vi.fn();
vi.mock("@/actions/conversations", () => ({ getOlderMessages: vi.fn(), sendManualMessage: (...a: unknown[]) => sendManualMessage(...a) }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a) } }));

import { MessageThread } from "./MessageThread";

const msg = (id: string, role: "USER" | "AGENT", content: string) => ({ id, conversationId: "c1", role, content, metadata: null, externalId: null, senderId: null, attachmentUrl: null, attachmentType: null, deliveryStatus: null, createdAt: new Date("2026-10-12T10:00:00Z"), sender: null });
const thread = (props: Partial<React.ComponentProps<typeof MessageThread>> = {}) => (
  <MessageThread conversationId="c1" contactName="Casey" initialMessages={[msg("m1", "USER", "¿Cuánto cuesta?")]} hasMoreInitially={false} canReply aiDrafts {...props} />
);
const ready = { state: "ready", draft: { id: "d1", content: "Hola Casey, desde $2,200." } };

describe("borrador de IA en el hilo", () => {
  beforeEach(() => {
    language = "es";
    for (const fn of [requestReplyDraft, regenerateReplyDraft, dismissReplyDraft, sendManualMessage, toast.success, toast.error]) fn.mockReset();
    sendManualMessage.mockResolvedValue({ success: true, delivered: true, message: msg("m2", "AGENT", "x") });
  });

  it("muestra que la IA está redactando y luego deja la respuesta ya escrita y editable en el cuadro", async () => {
    let resolve!: (v: unknown) => void;
    requestReplyDraft.mockReturnValue(new Promise((r) => (resolve = r)));
    render(thread());
    expect(screen.getByText("La IA está redactando una respuesta…")).toBeInTheDocument();
    resolve(ready);
    const box = (await screen.findByLabelText("Tu respuesta")) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe("Hola Casey, desde $2,200."));
    expect(screen.getByText("Respuesta sugerida por IA")).toBeInTheDocument();
    await userEvent.type(box, " Te esperamos.");
    expect(box.value).toBe("Hola Casey, desde $2,200. Te esperamos.");
  });

  it("'Usar respuesta' devuelve la sugerencia al cuadro aunque se haya editado o borrado", async () => {
    requestReplyDraft.mockResolvedValue(ready);
    render(thread());
    const box = (await screen.findByLabelText("Tu respuesta")) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).not.toBe(""));
    await userEvent.clear(box);
    await userEvent.type(box, "otra cosa");
    await userEvent.click(screen.getByRole("button", { name: "Usar respuesta" }));
    expect(box.value).toBe("Hola Casey, desde $2,200.");
  });

  it("en inglés el botón dice 'Use response'", async () => {
    language = "en";
    requestReplyDraft.mockResolvedValue(ready);
    render(thread());
    expect(await screen.findByRole("button", { name: "Use response" })).toBeInTheDocument();
    expect(screen.getByText("AI suggested response")).toBeInTheDocument();
  });

  it("Enter agrega un renglón y Ctrl+Enter envía con el borrador registrado; nada sale solo", async () => {
    requestReplyDraft.mockResolvedValue(ready);
    render(thread());
    const box = (await screen.findByLabelText("Tu respuesta")) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).not.toBe(""));
    expect(sendManualMessage).not.toHaveBeenCalled();
    await userEvent.type(box, "{Enter}");
    expect(sendManualMessage).not.toHaveBeenCalled();
    expect(box.value).toContain("\n");
    await userEvent.type(box, "{Control>}{Enter}{/Control}");
    await waitFor(() => expect(sendManualMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1", draftId: "d1" })));
    // Tras enviar desaparece la sugerencia.
    await waitFor(() => expect(screen.queryByText("Respuesta sugerida por IA")).not.toBeInTheDocument());
  });

  it("descartar quita la sugerencia y avisa al servidor; 'otra versión' pide una nueva", async () => {
    requestReplyDraft.mockResolvedValue(ready);
    regenerateReplyDraft.mockResolvedValue({ state: "ready", draft: { id: "d2", content: "Segunda versión" } });
    dismissReplyDraft.mockResolvedValue({ success: true });
    render(thread());
    const box = (await screen.findByLabelText("Tu respuesta")) as HTMLTextAreaElement;
    await userEvent.click(await screen.findByRole("button", { name: /Otra versión/ }));
    await waitFor(() => expect(box.value).toBe("Segunda versión"));
    await userEvent.click(screen.getByRole("button", { name: /Descartar/ }));
    expect(dismissReplyDraft).toHaveBeenCalledWith("d2");
    expect(screen.queryByText("Respuesta sugerida por IA")).not.toBeInTheDocument();
  });

  it("si no se pudo redactar ofrece reintentar y el inbox sigue funcionando", async () => {
    requestReplyDraft.mockResolvedValue({ state: "failed" });
    regenerateReplyDraft.mockResolvedValue({ state: "ready", draft: { id: "d3", content: "Listo" } });
    render(thread());
    expect(await screen.findByText("No se pudo redactar una sugerencia.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu respuesta")).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    await waitFor(() => expect((screen.getByLabelText("Tu respuesta") as HTMLTextAreaElement).value).toBe("Listo"));
  });

  it("sin IA, sin permiso o si lo último lo dijo el negocio no se pide ni se muestra nada", async () => {
    render(thread({ aiDrafts: false }));
    render(thread({ canReply: false }));
    render(thread({ initialMessages: [msg("m1", "USER", "Hola"), msg("m2", "AGENT", "Respondido")] }));
    expect(requestReplyDraft).not.toHaveBeenCalled();
    expect(screen.queryByText("Respuesta sugerida por IA")).not.toBeInTheDocument();
  });
});

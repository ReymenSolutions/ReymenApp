import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
const assign = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/actions/conversations", () => ({
  escalateConversation: vi.fn(), resolveConversation: vi.fn(), takeHumanControl: vi.fn(), releaseToAI: vi.fn(),
  assignConversation: (...a: unknown[]) => assign(...a),
}));

import { ConversationActions } from "./ConversationActions";

// jsdom no trae estas APIs, que Radix Select usa al abrir la lista.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

describe("ConversationActions", () => {
  it("al asignar avisa a la pantalla para que vuelva a cargar la conversación (el inbox la guarda en su estado)", async () => {
    const onChanged = vi.fn();
    render(
      <ConversationActions conversationId="c1" status="OPEN" aiHandled={false} assignedTo={null} teamUsers={[{ id: "u1", name: "Ana", email: "ana@x.com" }]} canReply canAssign onChanged={onChanged} />,
    );
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Ana" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("c1", "u1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SmartcardPanel } from "./SmartcardPanel";
import type { CompanyCardStats, SmartcardMembership } from "@/lib/smartcard-company";
let lang = "es";
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang }) }));
vi.mock("@/actions/portal/smartcard", () => ({ inviteSmartcardTeamMember: vi.fn(), updateSmartcardCardDestination: vi.fn(), createSmartcardCardProfile: vi.fn(), getSmartcardCardQrCode: vi.fn() }));
vi.mock("./SmartcardProfileDialog", () => ({ SmartcardProfileDialog: () => null }));
const membership: SmartcardMembership = { companyId: "c", companyName: "Negocio", companySlug: "negocio", userId: "u", roleCode: "owner", modules: ["smartcard"], limits: {} };
const cardStats: CompanyCardStats = { totalCards: 1, totalEvents: 8, byType: { qr_scan: 8 }, cards: [{ cardId: "card1", cardCode: "CARD1", clientName: "Recepción", status: "active", destinationType: "URL", destinationUrl: "https://example.com", profileId: null, totalEvents: 8, byType: { qr_scan: 8 }, lastActivityAt: "2026-10-15T00:30:00Z" }] };
function panel(roleCode = "owner", stats = cardStats, tab = lang === "en" ? "Cards" : "Tarjetas") { const view = render(<SmartcardPanel membership={{ ...membership, roleCode }} roster={[]} cardStats={stats} destinationTypes={[]} />); fireEvent.click(screen.getByRole("tab", { name: new RegExp(tab) })); return view; }
afterEach(() => { cleanup(); lang = "es"; });
describe("SmartcardPanel", () => {
  it("keeps activity readable and exposes accessible per-card disclosure", () => {
    panel();
    expect(screen.getByText("Activa")).toBeVisible();
    const button = screen.getByRole("button", { name: "Ver actividad" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Escaneos QR")).toHaveLength(1);
    fireEvent.click(button);
    expect(screen.queryAllByText("Escaneos QR")).toHaveLength(0);
  });
  it("preserves role restrictions for editing and team invitations", () => {
    panel("staff");
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Correo")).not.toBeInTheDocument();
    cleanup(); panel("manager");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByLabelText("Correo")).not.toBeInTheDocument();
  });
  it("uses English and distinguishes empty cards from cards without events", () => {
    lang = "en";
    panel("staff", { totalCards: 0, totalEvents: 0, byType: {}, cards: [] });
    expect(screen.getByText("No cards have been issued for this company yet.")).toBeVisible();
    cleanup(); panel("staff", { ...cardStats, totalEvents: 0, byType: {} }, "Overview");
    expect(screen.getByText("No activity yet.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Cards/ }));
    expect(screen.getByText("Active")).toBeVisible();
  });
});

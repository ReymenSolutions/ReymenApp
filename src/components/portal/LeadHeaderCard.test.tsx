import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { strings } from "@/lib/i18n";

vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
vi.mock("@/actions/leads", () => ({ updateLeadStatus: vi.fn(), deleteLead: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LeadHeaderCard, whatsappDigits } from "./LeadHeaderCard";

afterEach(cleanup);
const lead = { id: "l1", name: "Ana López", status: "NEW" as const, email: "ana@x.mx", phone: "81 1234 5678", doNotContact: false, source: "landing", since: "27 oct 2026" };

describe("whatsappDigits", () => {
  it("deja solo dígitos y asume México en celulares de 10", () => {
    expect(whatsappDigits("81 1234 5678")).toBe("528112345678");
    expect(whatsappDigits("+52 81 1234 5678")).toBe("528112345678");
    expect(whatsappDigits("123")).toBeNull();
    expect(whatsappDigits(null)).toBeNull();
  });
});

describe("LeadHeaderCard", () => {
  it("muestra nombre, etapa y acciones de contacto con un clic", () => {
    render(<LeadHeaderCard lead={lead} canUpdateStatus canDelete />);
    expect(screen.getByRole("heading", { name: "Ana López" })).toBeVisible();
    expect(screen.getByLabelText(/Etapa del contacto/)).toHaveValue("NEW");
    expect(screen.getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:81 1234 5678");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/528112345678");
    expect(screen.getByRole("link", { name: /Correo/ })).toHaveAttribute("href", "mailto:ana@x.mx");
    expect(screen.getByRole("button", { name: /Eliminar contacto/ })).toBeVisible();
  });

  it("sin permisos no ofrece cambiar etapa ni eliminar, y avisa si no se le debe contactar", () => {
    render(<LeadHeaderCard lead={{ ...lead, email: null, phone: null, doNotContact: true }} canUpdateStatus={false} canDelete={false} />);
    expect(screen.queryByLabelText(/Etapa del contacto/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Sin teléfono/)).toBeVisible();
    expect(screen.getByText(/Sin correo/)).toBeVisible();
    expect(screen.getByText(/No contactar/)).toBeVisible();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ theme: "light", setTheme: vi.fn(), lang: "es", setLang: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { InquiryForm, VisitForm, ActionPanel, type InquiryLabels, type VisitLabels } from "./PublicForms";

function errors() {
  return { phone_invalid: "WhatsApp inválido", postal_not_found: "CP no encontrado", postal_ambiguous: "Varias colonias", place_invalid: "Escribe tu colonia", unavailable: "No disponible", rate_limited: "Demasiados intentos", generic: "No se pudo enviar", slot_unavailable: "Horario ocupado", date_invalid: "Día inválido" };
}
const labels: InquiryLabels = {
  title: "Quiero informes", intro: "Intro", name: "Tu nombre", phone: "Tu WhatsApp", operation: "Quiero", buy: "Comprar", rent: "Rentar", type: "Tipo",
  budgetSale: "Hasta cuánto (MXN)", budgetRent: "Renta máxima (MXN)", place: "Colonia o CP", consent: "Acepto que Inmo use mis datos", submit: "Enviar mis datos", sending: "Enviando…",
  doneTitle: "¡Listo!", doneBody: "Te escribirá un asesor", doneNotSaved: "No pudimos guardar", whatsapp: "Continuar por WhatsApp", whatsappMsg: 'Hola, pedí informes de "Casa" (folio casa-1)',
  placeholders: { name: "Ej. María López", phone: "Ej. 81 1234 5678", budgetSale: "Ej. 4,500,000", budgetRent: "Ej. 18,000", place: "Ej. Cumbres o 64610" },
  errors: errors(),
};
const typeOptions = [{ value: "HOUSE", label: "Casa" }, { value: "APARTMENT", label: "Departamento" }];
const view = () => render(<InquiryForm slug="casa-1" whatsapp="+52 81 1111 2222" initial={{ operation: "SALE", propertyType: "HOUSE" }} typeOptions={typeOptions} labels={labels} />);
const fill = () => {
  fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "Laura Interesada" } });
  fireEvent.change(screen.getByLabelText("Tu WhatsApp"), { target: { value: "8112345678" } });
  if ((screen.getByLabelText("Hasta cuánto (MXN)") as HTMLInputElement).value === "") fireEvent.change(screen.getByLabelText("Hasta cuánto (MXN)"), { target: { value: "4250000" } });
  if ((screen.getByLabelText("Colonia o CP") as HTMLInputElement).value === "") fireEvent.change(screen.getByLabelText("Colonia o CP"), { target: { value: "Cumbres" } });
};

describe("InquiryForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("los campos de texto salen vacíos con un ejemplo de placeholder (solo las listas traen lo de la propiedad) y no deja enviar sin consentimiento", () => {
    view();
    for (const [label, ph] of [["Tu nombre", "Ej. María López"], ["Tu WhatsApp", "Ej. 81 1234 5678"], ["Hasta cuánto (MXN)", "Ej. 4,500,000"], ["Colonia o CP", "Ej. Cumbres o 64610"]] as const) {
      expect(screen.getByLabelText(label)).toHaveValue("");
      expect(screen.getByLabelText(label)).toHaveAttribute("placeholder", ph);
    }
    expect(screen.getByLabelText("Tipo")).toHaveValue("HOUSE");
    expect(screen.getByLabelText("Quiero")).toHaveValue("SALE");
    fill();
    expect(screen.getByRole("button", { name: "Enviar mis datos" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Enviar mis datos" })).toBeEnabled();
  });

  it("al rentar cambian la etiqueta y el placeholder del presupuesto", () => {
    view();
    fireEvent.change(screen.getByLabelText("Quiero"), { target: { value: "RENT" } });
    expect(screen.getByLabelText("Renta máxima (MXN)")).toHaveAttribute("placeholder", "Ej. 18,000");
  });

  it("envía los 5 datos y muestra el WhatsApp con el folio de la propiedad", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ success: true, saved: true }), { status: 200 }));
    view();
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar mis datos" }));
    await waitFor(() => expect(screen.getByText("¡Listo!")).toBeVisible());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/realty/public/inquiries");
    expect(JSON.parse(init.body)).toMatchObject({ slug: "casa-1", name: "Laura Interesada", phone: "8112345678", operation: "SALE", propertyType: "HOUSE", maxBudget: 4_250_000, place: "Cumbres", consent: true, website: "" });
    const wa = screen.getByRole("link", { name: /Continuar por WhatsApp/ });
    expect(wa.getAttribute("href")).toContain("https://wa.me/528111112222?text=");
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain("folio casa-1");
  });

  it("si el plan no pudo guardar, igual ofrece WhatsApp", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ success: true, saved: false }), { status: 200 }));
    view();
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar mis datos" }));
    await waitFor(() => expect(screen.getByText("No pudimos guardar")).toBeVisible());
    expect(screen.getByRole("link", { name: /Continuar por WhatsApp/ })).toBeVisible();
  });

  it("muestra el error del servidor traducido", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ error: "postal_ambiguous" }), { status: 422 }));
    view();
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar mis datos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Varias colonias");
    expect(screen.getByRole("button", { name: "Enviar mis datos" })).toBeEnabled();
  });

  it("límite de intentos (429)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("{}", { status: 429 }));
    view();
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar mis datos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados intentos");
  });
});

const visitLabels: VisitLabels = {
  intro: "Aparta tu visita", name: "Tu nombre", phone: "Tu WhatsApp", date: "Día de la visita", pickDay: "Elige un día", loading: "Buscando horarios…", noSlots: "No hay horarios ese día", times: "Horarios disponibles",
  notes: "Comentario (opcional)", consent: "Acepto", submit: "Solicitar visita", sending: "Enviando…", doneTitle: "¡Solicitud enviada!", doneBodyTemplate: "Pediste visitar el {when}.", doneNote: "Por confirmar",
  whatsapp: "Continuar por WhatsApp", whatsappMsgTemplate: "Hola, pedí una visita para el {when} (folio casa-1)",
  placeholders: { name: "Ej. María López", phone: "Ej. 81 1234 5678", notes: "Ej. Prefiero la tarde" }, errors: errors(),
};
const SLOTS = ["2026-11-03T16:00:00.000Z", "2026-11-03T17:00:00.000Z"]; // 10:00 y 11:00 en Ciudad de México
const visitView = () => render(<VisitForm slug="casa-1" whatsapp="+52 81 1111 2222" locale="es-MX" minDate="2026-11-02" maxDate="2026-12-02" labels={visitLabels} />);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("VisitForm · Agendar visita", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // Los eventos de la landing salen por sendBeacon; sin él caen a fetch y se llevarían las respuestas simuladas.
    Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(() => true), configurable: true });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sale vacío, con ejemplos como placeholder y pide un día para mostrar horarios", () => {
    visitView();
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("");
    expect(screen.getByLabelText("Tu nombre")).toHaveAttribute("placeholder", "Ej. María López");
    expect(screen.getByLabelText("Comentario (opcional)")).toHaveAttribute("placeholder", "Ej. Prefiero la tarde");
    expect(screen.getByLabelText("Día de la visita")).toHaveValue("");
    expect(screen.getByLabelText("Día de la visita")).toHaveAttribute("min", "2026-11-02");
    expect(screen.getByText("Elige un día")).toBeVisible();
    expect(screen.getByRole("button", { name: "Solicitar visita" })).toBeDisabled();
  });

  it("al elegir el día muestra los horarios en la hora del negocio y solicita la visita", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => (String(url).includes("visit-slots") ? json({ timezone: "America/Mexico_City", slots: SLOTS }) : json({ success: true, startsAt: SLOTS[0] })));
    visitView();
    fireEvent.change(screen.getByLabelText("Día de la visita"), { target: { value: "2026-11-03" } });
    expect(await screen.findByRole("button", { name: /10:00/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /11:00/ })).toBeVisible();
    const slotsCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(slotsCall).toContain("slug=casa-1");
    expect(slotsCall).toContain("date=2026-11-03");

    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "Pedro Visita" } });
    fireEvent.change(screen.getByLabelText("Tu WhatsApp"), { target: { value: "8112345678" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Solicitar visita" })).toBeDisabled(); // falta elegir horario
    fireEvent.click(screen.getByRole("button", { name: /10:00/ }));
    expect(screen.getByRole("button", { name: /10:00/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Solicitar visita" }));

    await waitFor(() => expect(screen.getByText("¡Solicitud enviada!")).toBeVisible());
    const postCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).includes("/visits"))!;
    expect(JSON.parse((postCall[1] as { body: string }).body)).toMatchObject({ slug: "casa-1", name: "Pedro Visita", phone: "8112345678", startsAt: SLOTS[0], consent: true, website: "" });
    const wa = screen.getByRole("link", { name: /Continuar por WhatsApp/ });
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain("folio casa-1");
    expect(screen.getByText(/Pediste visitar el .*10:00/)).toBeVisible();
  });

  it("sin horarios libres avisa; si el horario se ocupó muestra el error y recarga los horarios", async () => {
    const f = fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(json({ timezone: "America/Mexico_City", slots: [] }));
    visitView();
    fireEvent.change(screen.getByLabelText("Día de la visita"), { target: { value: "2026-11-08" } });
    expect(await screen.findByText("No hay horarios ese día")).toBeVisible();

    f.mockResolvedValueOnce(json({ timezone: "America/Mexico_City", slots: SLOTS }));
    fireEvent.change(screen.getByLabelText("Día de la visita"), { target: { value: "2026-11-03" } });
    fireEvent.click(await screen.findByRole("button", { name: /10:00/ }));
    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "Pedro Visita" } });
    fireEvent.change(screen.getByLabelText("Tu WhatsApp"), { target: { value: "8112345678" } });
    fireEvent.click(screen.getByRole("checkbox"));
    f.mockResolvedValueOnce(json({ error: "slot_unavailable" }, 409));
    f.mockResolvedValueOnce(json({ timezone: "America/Mexico_City", slots: [SLOTS[1]] }));
    fireEvent.click(screen.getByRole("button", { name: "Solicitar visita" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Horario ocupado");
    await waitFor(() => expect(screen.queryByRole("button", { name: /10:00/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /11:00/ })).toBeVisible();
  });
});

describe("ActionPanel", () => {
  afterEach(() => cleanup());
  const panel = () =>
    render(
      <ActionPanel
        slug="casa-1"
        title="Casa"
        whatsapp="+52 81 1111 2222"
        agentName="Diego Treviño"
        labels={{ tabs: "Contacto", tabVisit: "Agendar visita", tabInfo: "Pedir informes", advisor: "Tu asesor", whatsapp: "Escribir por WhatsApp", whatsappMsg: "Hola", share: "Compartir", copied: "Copiado", noContact: "Sin contacto", or: "o" }}
        visit={{ locale: "es-MX", minDate: "2026-11-02", maxDate: "2026-12-02", labels: visitLabels }}
        inquiry={{ initial: { operation: "SALE", propertyType: "HOUSE" }, typeOptions, labels }}
      />,
    );

  it("abre en «Agendar visita», cambia a «Pedir informes» y muestra al asesor", () => {
    panel();
    expect(screen.getByRole("tab", { name: "Agendar visita", selected: true })).toBeVisible();
    expect(screen.getByLabelText("Día de la visita")).toBeVisible();
    expect(screen.getByText("Diego Treviño")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Pedir informes" }));
    expect(screen.getByRole("tab", { name: "Pedir informes", selected: true })).toBeVisible();
    expect(screen.getByLabelText("Hasta cuánto (MXN)")).toBeVisible();
  });

  it("la barra fija del celular abre la pestaña de visita", () => {
    panel();
    fireEvent.click(screen.getByRole("tab", { name: "Pedir informes" }));
    Element.prototype.scrollIntoView = vi.fn();
    const bar = screen.getAllByRole("button", { name: "Agendar visita" }).find((b) => b.getAttribute("role") !== "tab")!;
    fireEvent.click(bar);
    expect(screen.getByRole("tab", { name: "Agendar visita", selected: true })).toBeVisible();
  });
});

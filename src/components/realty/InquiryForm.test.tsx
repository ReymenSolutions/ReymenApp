import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InquiryForm, type InquiryLabels } from "./PublicLanding";

const labels: InquiryLabels = {
  title: "Quiero informes", intro: "Intro", name: "Tu nombre", phone: "Tu WhatsApp", operation: "Quiero", buy: "Comprar", rent: "Rentar", type: "Tipo",
  budgetSale: "Hasta cuánto (MXN)", budgetRent: "Renta máxima (MXN)", place: "Colonia o CP", consent: "Acepto que Inmo use mis datos", submit: "Enviar mis datos", sending: "Enviando…",
  doneTitle: "¡Listo!", doneBody: "Te escribirá un asesor", doneNotSaved: "No pudimos guardar", whatsapp: "Continuar por WhatsApp", whatsappMsg: 'Hola, pedí informes de "Casa" (folio casa-1)',
  errors: { phone_invalid: "WhatsApp inválido", postal_not_found: "CP no encontrado", postal_ambiguous: "Varias colonias", place_invalid: "Escribe tu colonia", unavailable: "No disponible", rate_limited: "Demasiados intentos", generic: "No se pudo enviar" },
};
const typeOptions = [{ value: "HOUSE", label: "Casa" }, { value: "APARTMENT", label: "Departamento" }];
const view = () => render(<InquiryForm slug="casa-1" whatsapp="+52 81 1111 2222" initial={{ operation: "SALE", propertyType: "HOUSE", budget: 4_250_000, place: "Cumbres" }} typeOptions={typeOptions} labels={labels} />);
const fill = () => {
  fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "Laura Interesada" } });
  fireEvent.change(screen.getByLabelText("Tu WhatsApp"), { target: { value: "8112345678" } });
};

describe("InquiryForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("llega precargado con lo de la propiedad y no deja enviar sin consentimiento", () => {
    view();
    expect(screen.getByLabelText("Colonia o CP")).toHaveValue("Cumbres");
    expect(screen.getByLabelText("Tipo")).toHaveValue("HOUSE");
    expect(screen.getByLabelText("Quiero")).toHaveValue("SALE");
    expect(screen.getByLabelText("Hasta cuánto (MXN)")).toHaveValue((4_250_000).toLocaleString("es-MX"));
    fill();
    expect(screen.getByRole("button", { name: "Enviar mis datos" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Enviar mis datos" })).toBeEnabled();
  });

  it("al renta cambia la etiqueta del presupuesto", () => {
    view();
    fireEvent.change(screen.getByLabelText("Quiero"), { target: { value: "RENT" } });
    expect(screen.getByLabelText("Renta máxima (MXN)")).toBeInTheDocument();
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

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LeadSearchProfiles } from "./LeadSearchProfiles";
import type { LeadSearchView } from "@/lib/realty/lead-profile";

afterEach(cleanup);

const view: LeadSearchView = { id: "p1", active: true, operation: "Compra", type: "Casa", budget: "≤ $4.5M", zones: ["Cumbres", "Valle Poniente"], source: "Landing · smartcard", sourceProperty: { id: "prop1", title: "Casa en Cumbres" }, advisor: "Diego", bestMatch: 82 };

describe("LeadSearchProfiles", () => {
  it("sin perfil explica qué falta y ofrece agregarlo con el contacto precargado", () => {
    render(<LeadSearchProfiles views={[]} leadId="lead 1" canOperate lang="es" />);
    expect(screen.getByText(/Todavía no sabemos qué busca/)).toBeVisible();
    expect(screen.getByRole("link", { name: /Agregar lo que busca/ })).toHaveAttribute("href", "/portal/realty/prospects/new?leadId=lead%201");
  });

  it("sin permiso de operar Real Estate no ofrece agregar", () => {
    render(<LeadSearchProfiles views={[]} leadId="l1" canOperate={false} lang="es" />);
    expect(screen.queryByRole("link", { name: /Agregar/ })).not.toBeInTheDocument();
  });

  it("muestra los 5 datos, el match, la propiedad de origen y enlaza al prospecto", () => {
    render(<LeadSearchProfiles views={[view]} leadId="l1" canOperate lang="es" />);
    expect(screen.getByText("Compra")).toBeVisible();
    expect(screen.getByText("Casa")).toBeVisible();
    expect(screen.getByText("≤ $4.5M")).toBeVisible();
    expect(screen.getByText("Cumbres, Valle Poniente")).toBeVisible();
    expect(screen.getByText("82")).toBeVisible();
    expect(screen.getByRole("link", { name: "Casa en Cumbres" })).toHaveAttribute("href", "/portal/realty/properties/prop1");
    expect(screen.getByRole("link", { name: /Ver prospecto/ })).toHaveAttribute("href", "/portal/realty/prospects/p1");
  });

  it("marca los perfiles inactivos y habla inglés", () => {
    render(<LeadSearchProfiles views={[{ ...view, active: false, zones: [], sourceProperty: null, bestMatch: null }]} leadId="l1" canOperate lang="en" />);
    expect(screen.getByText("What they're looking for")).toBeVisible();
    expect(screen.getByText("Inactive")).toBeVisible();
    expect(screen.getByText("No neighborhood")).toBeVisible();
    expect(screen.getByRole("link", { name: /View prospect/ })).toBeVisible();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SmartcardCardPreview } from "./SmartcardCardPreview";

const product = { id: "p1", ref: null, title: "Sérum C", subtitle: "30 ml · Vitamina C", priceLabel: "$890", imageUrl: null, url: "https://x", sortOrder: 0 };
const green = { primary: "#1B4332", accent: "#D4A373", dark: false, background: null };

describe("SmartcardCardPreview", () => {
  it("replica la tarjeta pública: nombre, contacto, links y productos con características", () => {
    render(
      <SmartcardCardPreview
        lang="es"
        tokens={green}
        data={{ displayName: "Lonier Skin", jobTitle: "Premium Skincare México", whatsapp: "5512345678" }}
        links={[{ id: "l1", title: "Compra Aquí", icon: "mercadolibre" }]}
        products={[product]}
      />
    );
    expect(screen.getByText("Lonier Skin")).toBeVisible();
    expect(screen.getByText("Premium Skincare México")).toBeVisible();
    expect(screen.getByText("WhatsApp")).toBeVisible();
    expect(screen.getByText("Guardar contacto")).toBeVisible();
    expect(screen.getByText("Compra Aquí")).toBeVisible();
    expect(screen.getByText("$890")).toBeVisible();
    expect(screen.getByText("30 ml · Vitamina C")).toBeVisible();
  });
  it("usa los colores del tema: el panel superior es el color primario y el botón el de acento", () => {
    const { container } = render(<SmartcardCardPreview lang="en" tokens={green} data={{ displayName: "" }} links={[]} products={[]} />);
    expect(screen.getByText("Your name")).toBeVisible();
    expect(container.querySelector("[style*='background: rgb(27, 67, 50)']")).not.toBeNull();
    expect(screen.getByText("Save contact").parentElement).toHaveStyle({ background: "#D4A373" });
  });
  it("con tema oscuro el panel superior usa el acento", () => {
    const { container } = render(<SmartcardCardPreview lang="es" tokens={{ primary: "#FFFFFF", accent: "#C9A227", dark: true, background: null }} data={{ displayName: "X" }} links={[]} products={[]} />);
    expect(container.querySelector("[style*='background: rgb(201, 162, 39)']")).not.toBeNull();
  });
  it("con fondo propio pinta ese color como fondo de la tarjeta", () => {
    const { container } = render(<SmartcardCardPreview lang="es" tokens={{ primary: "#1B4332", accent: "#D4A373", dark: false, background: "#EAD5C5" }} data={{ displayName: "X" }} links={[]} products={[]} />);
    expect(container.querySelector("[style*='background: rgb(234, 213, 197)']")).not.toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SmartcardCardPreview } from "./SmartcardCardPreview";

const product = { id: "p1", ref: null, title: "Sérum C", subtitle: "30 ml · Vitamina C", priceLabel: "$890", imageUrl: null, url: "https://x", sortOrder: 0 };

describe("SmartcardCardPreview", () => {
  it("refleja nombre, colores, links con ícono y productos con características", () => {
    render(
      <SmartcardCardPreview
        lang="es"
        data={{ displayName: "Lonier Skin", whatsapp: "5512345678", primaryColor: "#112233", accentColor: "#ffcc00" }}
        links={[{ id: "l1", title: "Comprar en Mercado Libre", icon: "mercadolibre" }, { id: "l2", title: "Tienda", icon: "shopping" }]}
        products={[product]}
      />
    );
    expect(screen.getByText("Lonier Skin")).toBeVisible();
    expect(screen.getByText("Comprar en Mercado Libre")).toBeVisible();
    expect(screen.getByText("ML")).toBeVisible();
    expect(screen.getByText("Sérum C")).toBeVisible();
    expect(screen.getByText("Vitamina C")).toBeVisible();
    expect(screen.getByText("WhatsApp")).toHaveStyle({ backgroundColor: "#ffcc00", color: "#000000" });
  });
  it("usa colores por defecto si los hex no son válidos", () => {
    const { container } = render(<SmartcardCardPreview lang="en" data={{ displayName: "", primaryColor: "rojo" }} links={[]} products={[]} />);
    expect(screen.getByText("Your name")).toBeVisible();
    expect(container.querySelector("[style*='background-color: rgb(17, 17, 17)']")).not.toBeNull();
  });
});

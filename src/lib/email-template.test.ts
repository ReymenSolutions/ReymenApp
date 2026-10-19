import { describe, it, expect } from "vitest";
import { escapeHtml, renderBrandedEmail } from "./email-template";

describe("renderBrandedEmail", () => {
  it("escapa el texto que llega de fuera y no deja pasar HTML", () => {
    const { html, text } = renderBrandedEmail({
      title: "Nuevo contacto",
      rows: [{ label: "Nombre", value: '<img src=x onerror="alert(1)">' }],
      note: { label: "Mensaje", text: "<script>alert(1)</script>\nsegunda línea" },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<br>");
    expect(text).toContain("segunda línea");
  });

  it("solo deja enlaces http(s), mailto y tel", () => {
    const { html } = renderBrandedEmail({
      title: "x",
      rows: [{ label: "a", value: "malo", href: "javascript:alert(1)" }, { label: "b", value: "bueno", href: "tel:+525512345678" }],
      actions: [{ label: "Peligro", url: "javascript:alert(1)" }, { label: "Ir", url: "https://app.reymen.mx" }],
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="tel:+525512345678"');
    expect(html).toContain("Ir");
    expect(html).not.toContain("Peligro");
  });

  it("omite las filas vacías y trae versión de texto", () => {
    const { html, text } = renderBrandedEmail({ title: "T", rows: [{ label: "Negocio", value: "" }, { label: "Nombre", value: "Ana" }] });
    expect(html).not.toContain("Negocio");
    expect(text).toContain("Nombre: Ana");
  });

  it("escapeHtml cubre los cinco caracteres", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

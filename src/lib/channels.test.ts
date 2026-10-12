import { describe, it, expect } from "vitest";
import { normalizeChannel, parseInboxTab, channelsOfTab, tabOfChannel, outboundWorkflowPath, normalizeEmail, messagePreview } from "./channels";

describe("canales del inbox", () => {
  it("normaliza los nombres que mandan los conectores", () => {
    expect(normalizeChannel("WhatsApp")).toBe("whatsapp");
    expect(normalizeChannel(" IG ")).toBe("instagram");
    expect(normalizeChannel("Facebook Messenger")).toBe("messenger");
    expect(normalizeChannel("Website Chat")).toBe("webchat");
    expect(normalizeChannel("contact_form")).toBe("enquiry");
    expect(normalizeChannel("correo")).toBe("email");
    expect(normalizeChannel("telegram")).toBe("telegram"); // desconocido: se conserva
    expect(normalizeChannel("")).toBe("whatsapp");
    expect(normalizeChannel(undefined)).toBe("whatsapp");
  });
  it("las pestañas agrupan canales; correo y consultas comparten pestaña", () => {
    expect(channelsOfTab("email")).toEqual(["email", "enquiry"]);
    expect(channelsOfTab("all")).toBeNull();
    expect(tabOfChannel("enquiry")).toBe("email");
    expect(tabOfChannel("telegram")).toBe("all");
    expect(parseInboxTab("instagram")).toBe("instagram");
    expect(parseInboxTab("raro")).toBe("all");
  });
  it("el flujo de salida de n8n es seguro y conserva el de WhatsApp", () => {
    expect(outboundWorkflowPath("whatsapp")).toBe("whatsapp-outbound");
    expect(outboundWorkflowPath("instagram")).toBe("instagram-outbound");
    expect(outboundWorkflowPath("../x/y")).toBe("xy-outbound");
  });
  it("correo válido y vista previa de una línea", () => {
    expect(normalizeEmail(" Ana@Correo.COM ")).toBe("ana@correo.com");
    expect(normalizeEmail("no-es-correo")).toBeNull();
    expect(messagePreview("Hola\n\n  quiero   cotizar " + "x".repeat(300))).toHaveLength(140);
    expect(messagePreview("Hola\nque tal")).toBe("Hola que tal");
  });
});

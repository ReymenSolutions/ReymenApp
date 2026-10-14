import { describe, it, expect } from "vitest";
import { extractMemberToken, firstName, maskPhone, memberCardPath } from "./token";
import { buildWalletCard, getWalletAvailability } from "./wallet";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv_-";

describe("extractMemberToken", () => {
  it("acepta la URL del QR, la ruta o el token solo", () => {
    expect(extractMemberToken(`https://app.reymen.mx/lealtad/cafe-norte/tarjeta/${TOKEN}`)).toBe(TOKEN);
    expect(extractMemberToken(`/lealtad/cafe-norte/tarjeta/${TOKEN}?x=1`)).toBe(TOKEN);
    expect(extractMemberToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });
  it("rechaza lo que no es un token", () => {
    expect(extractMemberToken("")).toBeNull();
    expect(extractMemberToken("hola")).toBeNull();
    expect(extractMemberToken("https://otro.sitio/x")).toBeNull();
  });
  it("la URL de la tarjeta no lleva datos personales, solo el token", () => {
    expect(memberCardPath("cafe-norte", TOKEN)).toBe(`/lealtad/cafe-norte/tarjeta/${TOKEN}`);
  });
});

describe("maskPhone / firstName", () => {
  it("oculta el WhatsApp salvo los últimos 4", () => {
    expect(maskPhone("+528155501234")).toBe("•••• 1234");
  });
  it("la tarjeta saluda solo con el primer nombre", () => {
    expect(firstName("  Mariana López ")).toBe("Mariana");
  });
});

describe("wallet", () => {
  it("sin credenciales nada se reporta como conectado", () => {
    expect(getWalletAvailability()).toEqual({ apple: false, google: false });
    expect(getWalletAvailability()).toEqual({ apple: false, google: false });
  });
  it("el pase refleja el progreso y su QR es la URL de la tarjeta", () => {
    const card = buildWalletCard({
      businessName: "Café Norte",
      programName: "Club Café Norte",
      memberFirstName: "Mariana",
      cycleVisits: 7,
      visitGoal: 10,
      rewardName: "Bebida gratis",
      availableRewards: 0,
      cardUrl: "https://x/lealtad/cafe-norte/tarjeta/t",
    });
    expect(card.progressLabel).toBe("7 de 10 visitas");
    expect(card.message).toBe("Te faltan 3 visitas para bebida gratis");
    expect(card.barcode).toEqual({ format: "QR", message: "https://x/lealtad/cafe-norte/tarjeta/t" });
  });
});

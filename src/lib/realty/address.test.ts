import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://app.test" }));

import { isPostalCode, lookupPostalCode } from "./postal";
import { geocodeStructured } from "./geocode";

describe("código postal (SEPOMEX)", () => {
  it("valida 5 dígitos", () => {
    expect(isPostalCode("64610")).toBe(true);
    expect(isPostalCode("6461")).toBe(false);
    expect(isPostalCode("64a10")).toBe(false);
  });

  it("devuelve municipio, estado y colonias ordenadas", async () => {
    const info = await lookupPostalCode("64150");
    expect(info).not.toBeNull();
    expect(info!.estado).toBe("Nuevo León");
    expect(info!.municipio).toBe("Monterrey");
    expect(info!.colonias.length).toBeGreaterThan(0);
    const names = info!.colonias.map((c) => c.nombre);
    expect([...names].sort((a, b) => a.localeCompare(b, "es"))).toEqual(names);
  });

  it("CP inválido o inexistente → null", async () => {
    expect(await lookupPostalCode("123")).toBeNull();
    expect(await lookupPostalCode("00000")).toBeNull();
  });
});

describe("geocodeStructured: de lo más fino a lo más general", () => {
  const calls: URL[] = [];
  beforeEach(() => {
    calls.length = 0;
    process.env.GEOCODER_URL = "http://geo.test/search";
  });

  function mockFetch(answer: (u: URL) => unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        calls.push(input);
        return new Response(JSON.stringify(answer(input)), { status: 200 });
      }),
    );
  }

  it("si la calle no aparece, ubica la colonia y lo dice", async () => {
    mockFetch((u) => (u.searchParams.get("q")?.startsWith("Colonia Prueba") ? [{ lat: "25.7", lon: "-100.3", display_name: "Colonia Prueba" }] : []));
    const r = await geocodeStructured("org1", { street: "Calle Falsa 123", colonia: "Colonia Prueba", municipio: "Monterrey", estado: "Nuevo León", cp: "64150" });
    expect(r.precision).toBe("colonia");
    expect(r.results[0]).toMatchObject({ lat: 25.7, lng: -100.3 });
    // 1) estructurada con calle, 2) texto con calle, 3) colonia
    expect(calls).toHaveLength(3);
    expect(calls[0].searchParams.get("street")).toBe("Calle Falsa 123");
    expect(calls[0].searchParams.get("postalcode")).toBe("64150");
  });

  it("con la casa encontrada no sigue buscando", async () => {
    mockFetch(() => [{ lat: "25.1", lon: "-100.1", display_name: "Casa" }]);
    const r = await geocodeStructured("org1", { street: "Otra 1", colonia: "X", municipio: "Monterrey", estado: "Nuevo León", cp: "64610" });
    expect(r.precision).toBe("address");
    expect(calls).toHaveLength(1);
  });

  it("sin CP, colonia ni calle pide el CP", async () => {
    mockFetch(() => []);
    await expect(geocodeStructured("org1", { street: "", colonia: "", municipio: "", estado: "", cp: "" })).rejects.toThrow(/código postal/);
  });
});

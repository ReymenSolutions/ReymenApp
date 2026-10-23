// @vitest-environment node
import { describe, it, expect, vi, afterAll } from "vitest";

const geo = vi.hoisted(() => ({ geocodeStructured: vi.fn(), geocoderEnabled: () => true }));
vi.mock("@/lib/realty/geocode", () => geo);

import { prisma } from "@/lib/prisma";
import { loadPostalPoints, locatePostalCode } from "./postal-points";

const CPS = ["64630", "99998"];

afterAll(async () => {
  await prisma.postalCodePoint.deleteMany({ where: { postalCode: { in: CPS } } });
});

describe("postal-points", () => {
  it("ubica un CP por su colonia principal (SEPOMEX) y lo guarda", async () => {
    geo.geocodeStructured.mockResolvedValueOnce({ results: [{ lat: 25.7, lng: -100.39, label: "Colinas de San Jerónimo" }], precision: "colonia" });
    expect(await locatePostalCode("org-test", "64630")).toEqual({ lat: 25.7, lng: -100.39 });
    const arg = geo.geocodeStructured.mock.calls[0][1];
    expect(arg).toMatchObject({ cp: "64630", municipio: "Monterrey", estado: "Nuevo León" });
    expect(arg.colonia.length).toBeGreaterThan(2);
    expect((await loadPostalPoints(["64630", "00000"])).get("64630")).toEqual({ lat: 25.7, lng: -100.39 });
  });

  it("no usa un resultado que solo ubicó el municipio, y recuerda que no se encontró", async () => {
    geo.geocodeStructured.mockResolvedValueOnce({ results: [{ lat: 25.67, lng: -100.31, label: "Monterrey" }], precision: "municipality" });
    expect(await locatePostalCode("org-test", "99998")).toBeNull();
    const row = await prisma.postalCodePoint.findUnique({ where: { postalCode: "99998" } });
    expect(row?.latitude).toBeNull();
    expect((await loadPostalPoints(["99998"])).size).toBe(0);
  });

  it("si el servicio falla no guarda nada (se reintenta)", async () => {
    await prisma.postalCodePoint.deleteMany({ where: { postalCode: "99998" } });
    geo.geocodeStructured.mockRejectedValueOnce(new Error("busy"));
    expect(await locatePostalCode("org-test", "99998")).toBeNull();
    expect(await prisma.postalCodePoint.findUnique({ where: { postalCode: "99998" } })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { workshopQuoteFilename } from "./quote-filename";

describe("workshop quote filename", () => {
  it("uses the real service and vehicle, without unsafe characters", () => {
    expect(workshopQuoteFilename({ servicioTitulo: "Afinación mayor", vehicle: { marca: "Audi", modelo: "A1", anio: 2021 } })).toBe("cotizacion-afinacion-mayor-audi-a1-2021-tallerwolf.pdf");
    expect(workshopQuoteFilename({ servicioTitulo: "Frenos / <revisión>", vehicle: { marca: "Nissan", modelo: "Versa", anio: 2020 } })).toBe("cotizacion-frenos-revision-nissan-versa-2020-tallerwolf.pdf");
  });
});

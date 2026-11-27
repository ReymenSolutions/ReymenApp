import { describe, expect, it } from "vitest";
import { calculateNetLines, netFromGrossReference } from "./money";

describe("workshop net money", () => {
  it("calculates tax and internal utility from net prices", () => {
    const result = calculateNetLines([{ cantidad: "2", precioUnitarioNeto: "100.00", costoUnitarioNeto: "60.00" }]);
    expect(result.subtotalNeto.toFixed(2)).toBe("200.00");
    expect(result.iva.toFixed(2)).toBe("32.00");
    expect(result.total.toFixed(2)).toBe("232.00");
    expect(result.utilidadNeta?.toFixed(2)).toBe("80.00");
  });

  it("balances the $4,400 gross reference to the declared net subtotal", () => {
    const result = netFromGrossReference(["1095.00", "230.00", "360.00", "810.00", "320.00", "1200.00", "385.00", "0.00"]);
    expect(result.subtotalNeto.toFixed(2)).toBe("3793.10");
    expect(result.iva.toFixed(2)).toBe("606.90");
    expect(result.total.toFixed(2)).toBe("4400.00");
    expect(result.lines.reduce((sum, line) => sum + Number(line.net), 0).toFixed(2)).toBe("3793.10");
    expect(result.lines.at(-1)?.net.toFixed(2)).toBe("0.00");
  });
  it("keeps net prices and utility but charges no IVA when disabled", () => {
    const result = calculateNetLines([{ cantidad: "1", precioUnitarioNeto: "3793.10", costoUnitarioNeto: "2500.00" }], false);
    expect(result.subtotalNeto.toFixed(2)).toBe("3793.10");
    expect(result.iva.toFixed(2)).toBe("0.00");
    expect(result.total.toFixed(2)).toBe("3793.10");
    expect(result.lines[0].ivaImporte.toFixed(2)).toBe("0.00");
    expect(result.utilidadNeta?.toFixed(2)).toBe("1293.10");
  });
});

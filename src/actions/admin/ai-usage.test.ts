// @vitest-environment node
import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" }));

const { createAiRate, exportAiUsageCsv } = await import("./ai-usage");
const valid = { provider: "anthropic", model: "claude-x", currency: "USD" as const, inputPerMTok: 3, outputPerMTok: 15, effectiveFrom: new Date("2026-10-01"), source: "página de precios, consultada 2026-10-12" };

describe("tarifas y exportación de IA (solo admin)", () => {
  afterAll(async () => {
    await prisma.aiRate.deleteMany({ where: { model: "claude-x" } });
  });

  it("un usuario de un cliente no puede ver costos ni cargar tarifas", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: "org1" }));
    await expect(createAiRate(valid)).rejects.toThrow(/autorizado/i);
    await expect(exportAiUsageCsv({})).rejects.toThrow(/autorizado/i);
    authMock.mockResolvedValue(null);
    await expect(createAiRate(valid)).rejects.toThrow(/autorizado/i);
  });

  it("el admin agrega tarifas (inmutables: un cambio es otra fila) y queda en la bitácora", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const first = await createAiRate({ ...valid, cacheReadPerMTok: "0.3" as never, cacheWritePerMTok: "" as never });
    const second = await createAiRate({ ...valid, inputPerMTok: 6, effectiveFrom: new Date("2026-11-01") });
    expect(first.id).not.toBe(second.id);
    const rows = await prisma.aiRate.findMany({ where: { model: "claude-x" }, orderBy: { effectiveFrom: "asc" } });
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].cacheReadPerMTok)).toBe(0.3);
    expect(rows[0].cacheWritePerMTok).toBeNull();
    expect(Number(rows[1].inputPerMTok)).toBe(6);
    expect(await prisma.auditLog.count({ where: { action: "ai.rate_create", resourceId: first.id } })).toBe(1);
  });

  it("rechaza datos inválidos: proveedor desconocido, precio negativo, sin fuente", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    await expect(createAiRate({ ...valid, provider: "otro" })).rejects.toThrow(/tarifa/i);
    await expect(createAiRate({ ...valid, inputPerMTok: -1 })).rejects.toThrow(/tarifa/i);
    await expect(createAiRate({ ...valid, source: "" })).rejects.toThrow(/tarifa/i);
    expect(await prisma.aiRate.count({ where: { model: "claude-x" } })).toBe(2);
  });

  it("el admin exporta el CSV", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    expect((await exportAiUsageCsv({ period: "7d" })).split("\n")[0]).toContain("fecha,tenant");
  });
});

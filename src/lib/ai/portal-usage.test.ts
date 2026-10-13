// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";
import { getPortalAiUsage } from "./portal-usage";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: () => false }));
const { requestAiCapacity } = await import("@/actions/ai-capacity");

describe("Mi consumo de IA (portal)", () => {
  let org: { id: string };
  beforeAll(async () => {
    org = await createTestOrg("Portal Usage");
  });
  afterAll(async () => {
    await prisma.request.deleteMany({ where: { organizationId: org.id } });
    await cleanupOrg(org.id);
  });

  it("devuelve solo información comercial: porcentajes y fechas, sin montos ni costos", async () => {
    const u = await getPortalAiUsage(org.id);
    expect(u.usedPercent).toBe(0);
    expect(u.remainingPercent).toBe(100);
    expect(u.paused).toBe(false);
    expect(u.renewsAt.getTime()).toBeGreaterThan(Date.now());
    const keys = JSON.stringify(Object.keys(u));
    expect(keys).not.toMatch(/mxn|cost|budget|model|provider/i);
  });

  it("la solicitud de capacidad la crea un usuario autorizado y solo permite una abierta", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await requestAiCapacity();
    expect((await getPortalAiUsage(org.id)).pendingRequest).toBe(true);
    await expect(requestAiCapacity()).rejects.toThrow(/solicitud de capacidad abierta/);
    authMock.mockResolvedValue(null);
    await expect(requestAiCapacity()).rejects.toThrow(/autorizado/i);
  });
});

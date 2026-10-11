// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { updateLeadColumns } = await import("./lead-columns");
const { createCustomField, setCustomFieldActive } = await import("./custom-fields");

describe("columnas de la tabla de leads", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };
  const as = (u: { id: string }, role: "OWNER" | "AGENT") => authMock.mockResolvedValue(fakeSession({ id: u.id, role, organizationId: org.id }));

  beforeAll(async () => {
    org = await createTestOrg("Lead Columns Org");
    owner = await createTestUser(org.id, "OWNER", "lc-owner");
    agent = await createTestUser(org.id, "AGENT", "lc-agent");
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("es una preferencia por usuario: no cambia la de otra persona", async () => {
    as(owner, "OWNER");
    const { fieldId, key } = await createCustomField({ label: "Aseguradora", type: "TEXT" });
    await updateLeadColumns({ hidden: ["score"], custom: [key] });

    const mine = await prisma.user.findUnique({ where: { id: owner.id }, select: { leadColumns: true } });
    const theirs = await prisma.user.findUnique({ where: { id: agent.id }, select: { leadColumns: true } });
    expect(mine?.leadColumns).toEqual({ hidden: ["score"], custom: [key] });
    expect(theirs?.leadColumns).toBeNull();
    expect(fieldId).toBeTruthy();
  });

  it("cualquier rol del cliente puede ordenar su tabla", async () => {
    as(agent, "AGENT");
    await updateLeadColumns({ hidden: ["source"], custom: [] });
    expect((await prisma.user.findUnique({ where: { id: agent.id }, select: { leadColumns: true } }))?.leadColumns).toEqual({ hidden: ["source"], custom: [] });
  });

  it("descarta columnas inventadas y campos que no existen o están archivados", async () => {
    as(owner, "OWNER");
    const { fieldId, key } = await createCustomField({ label: "Alergias", type: "TEXT" });
    await setCustomFieldActive(fieldId, false);
    const res = await updateLeadColumns({ hidden: ["name" as never, "date"], custom: [key, "no_existe"] });
    expect(res.prefs).toEqual({ hidden: ["date"], custom: [] });
  });

  it("rechaza sin sesión", async () => {
    authMock.mockResolvedValue(null);
    await expect(updateLeadColumns({ hidden: [], custom: [] })).rejects.toThrow();
  });
});

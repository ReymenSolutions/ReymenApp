// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { countDuplicateGroups, findDuplicateGroups, findPotentialDuplicateLeads } from "./duplicate-detection";
import { phoneKey } from "./phone";

describe("duplicate detection", () => {
  const orgs: string[] = [];
  afterEach(async () => {
    for (const id of orgs.splice(0)) await cleanupOrg(id);
  });
  const newOrg = async () => {
    const o = await createTestOrg("Dup Org");
    orgs.push(o.id);
    return o;
  };
  const mk = (organizationId: string, name: string, data: { phone?: string; email?: string; deletedAt?: Date } = {}) =>
    prisma.lead.create({ data: { organizationId, name, email: data.email, phone: data.phone, phoneKey: phoneKey(data.phone), deletedAt: data.deletedAt } });

  it("matches the same phone in any format, and the same email in any case", async () => {
    const org = await newOrg();
    const a = await mk(org.id, "A", { phone: "+52 1 55 1234 5678" });
    const b = await mk(org.id, "B", { email: "Persona@Correo.com" });
    await mk(org.id, "Otro", { phone: "55 9999 0000", email: "otro@correo.com" });

    const byPhone = await findPotentialDuplicateLeads(org.id, { phone: "(55) 1234-5678" });
    expect(byPhone.map((l) => l.id)).toEqual([a.id]);
    const byEmail = await findPotentialDuplicateLeads(org.id, { email: "persona@correo.com" });
    expect(byEmail.map((l) => l.id)).toEqual([b.id]);
    expect(await findPotentialDuplicateLeads(org.id, { phone: "12", email: null })).toEqual([]);
  });

  it("ignores deleted leads and other organizations, and can exclude the lead itself", async () => {
    const org = await newOrg();
    const other = await newOrg();
    const live = await mk(org.id, "Vivo", { phone: "55 1111 2222" });
    await mk(org.id, "Borrado", { phone: "55 1111 2222", deletedAt: new Date() });
    await mk(other.id, "De otra org", { phone: "55 1111 2222" });

    expect((await findPotentialDuplicateLeads(org.id, { phone: "55 1111 2222" })).map((l) => l.id)).toEqual([live.id]);
    expect(await findPotentialDuplicateLeads(org.id, { phone: "55 1111 2222" }, live.id)).toEqual([]);
  });

  it("groups contacts that share a phone or an email, oldest first, without repeating a group", async () => {
    const org = await newOrg();
    const old = await prisma.lead.create({ data: { organizationId: org.id, name: "Más antiguo", phone: "55 3333 4444", phoneKey: "5533334444", email: "x@correo.com", createdAt: new Date(Date.now() - 86_400_000) } });
    const dup = await mk(org.id, "Más nuevo", { phone: "+52 1 55 3333 4444", email: "X@correo.com" }); // mismo teléfono Y mismo correo: un solo grupo
    const e1 = await mk(org.id, "Correo 1", { email: "solo@correo.com" });
    const e2 = await mk(org.id, "Correo 2", { email: "SOLO@correo.com" });
    await mk(org.id, "Único", { phone: "55 7777 8888" });

    const groups = await findDuplicateGroups(org.id);
    expect(groups).toHaveLength(2);
    const phoneGroup = groups.find((g) => g.reason === "phone");
    expect(phoneGroup?.leads.map((l) => l.id)).toEqual([old.id, dup.id]);
    const emailGroup = groups.find((g) => g.reason === "email" && g.value === "solo@correo.com");
    expect(emailGroup?.leads.map((l) => l.id).sort()).toEqual([e1.id, e2.id].sort());
    // El conteo cuenta por separado teléfono y correo (3 grupos aquí), el listado los junta si son las mismas personas.
    expect(await countDuplicateGroups(org.id)).toBe(3);
  });

  it("reports nothing when there are no duplicates or the duplicates were already merged", async () => {
    const org = await newOrg();
    await mk(org.id, "Uno", { phone: "55 1212 3434" });
    await mk(org.id, "Dos", { phone: "55 1212 3434", deletedAt: new Date() });
    expect(await findDuplicateGroups(org.id)).toEqual([]);
    expect(await countDuplicateGroups(org.id)).toBe(0);
  });
});

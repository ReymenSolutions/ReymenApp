// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./plans", () => ({ getPlan: async (key: string) => ({ limits: { users: key === "professional" ? 10 : key === "business" ? null : 2 } }) }));

// Cliente falso de Supabase: cada consulta queda registrada con su tabla,
// operación y filtros, y responde lo que diga `respond`.
interface Call {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, string, unknown][];
}
let calls: Call[] = [];
let respond: (call: Call) => { data?: unknown; error?: { message: string } | null } = () => ({ data: null });
const auth = {
  admin: {
    createUser: vi.fn(),
    listUsers: vi.fn(),
    getUserById: vi.fn(),
    deleteUser: vi.fn(async () => ({})),
  },
};

function query(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const builder: Record<string, unknown> = {};
  const chain = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => (fn(...a), builder);
  builder.select = chain(() => {});
  builder.order = chain(() => {});
  builder.update = chain((p) => ((call.op = "update"), (call.payload = p)));
  builder.insert = chain((p) => ((call.op = "insert"), (call.payload = p)));
  builder.delete = chain(() => (call.op = "delete"));
  builder.eq = chain((c, v) => call.filters.push(["eq", c as string, v]));
  builder.is = chain((c, v) => call.filters.push(["is", c as string, v]));
  const finish = () => {
    calls.push(call);
    return Promise.resolve({ error: null, ...respond(call) });
  };
  builder.maybeSingle = finish;
  builder.single = finish;
  builder.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => finish().then(ok, ko);
  return builder;
}

// Clientes que existen en Reymen (para distinguir vínculos válidos de rotos).
let reymenOrgs: { id: string; name: string; [k: string]: unknown }[] = [];
vi.mock("./prisma", () => ({
  prisma: {
    organization: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => reymenOrgs.filter((o) => where.id.in.includes(o.id)),
      findUnique: async ({ where }: { where: { id: string } }) => reymenOrgs.find((o) => o.id === where.id) ?? null,
    },
  },
}));

let configured = true;
vi.mock("./smartcard-supabase", () => ({
  getSmartcardAdminClient: () => (configured ? { from: query, auth } : null),
}));

const { getSmartcardLinkState, linkSmartcardCompany, listSmartcardCompanies, syncSmartcardMemberLimit, planMemberLimit, unlinkSmartcardCompany, addSmartcardMember, removeSmartcardMember, createSmartcardCompanyForOrg, smartcardRoleForUserRole } =
  await import("./smartcard-link");

const has = (c: Call, f: [string, string, unknown]) => c.filters.some((x) => x[0] === f[0] && x[1] === f[1] && x[2] === f[2]);

beforeEach(() => {
  calls = [];
  configured = true;
  reymenOrgs = [];
  respond = () => ({ data: null });
  vi.clearAllMocks();
});

describe("getSmartcardLinkState", () => {
  it("reports not_configured without the Supabase env", async () => {
    configured = false;
    expect(await getSmartcardLinkState("org1")).toEqual({ status: "not_configured" });
  });

  it("offers free and broken-link companies, and shows the ones other clients have", async () => {
    reymenOrgs = [{ id: "org2", name: "Lonier" }];
    respond = (c) =>
      c.filters.length
        ? { data: null }
        : {
            data: [
              { id: "c1", name: "Free", slug: "free", external_org_id: null },
              { id: "c2", name: "Villa", slug: "villa", external_org_id: "old-org" },
              { id: "c3", name: "Lonier Skin", slug: "lonier", external_org_id: "org2" },
            ],
          };
    expect(await getSmartcardLinkState("org1")).toEqual({
      status: "unlinked",
      candidates: [
        { id: "c1", name: "Free", slug: "free", staleOrgId: null },
        { id: "c2", name: "Villa", slug: "villa", staleOrgId: "old-org" },
      ],
      taken: [{ id: "c3", name: "Lonier Skin", slug: "lonier", clientId: "org2", clientName: "Lonier" }],
    });
  });

  it("shows members with their email, role and status", async () => {
    respond = (c) => {
      if (c.table === "companies") return { data: { id: "c1", name: "Villa", slug: "villa" } };
      if (c.table === "company_users") return { data: [{ id: "m1", user_id: "u1", role_id: "r1", status: "active" }] };
      if (c.table === "modules") return { data: { id: "mod-sc" } };
      if (c.table === "company_modules") return { data: { module_id: "mod-sc", limits: { max_team_members: 2 } } };
      return { data: [{ id: "r1", code: "owner" }] };
    };
    auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "Dueno@Villa.mx" } } });
    expect(await getSmartcardLinkState("org1")).toEqual({
      status: "linked",
      company: { id: "c1", name: "Villa", slug: "villa" },
      members: [{ id: "m1", email: "dueno@villa.mx", roleCode: "owner", status: "active" }],
      memberLimit: 2,
    });
    expect(has(calls.find((c) => c.table === "company_users")!, ["eq", "company_id", "c1"])).toBe(true);
  });
});

describe("linkSmartcardCompany", () => {
  // select por external_org_id = cliente actual → null; select por id → la empresa destino.
  const target = (externalOrgId: string | null) => (c: Call) => {
    if (c.op === "update") return { data: { id: "c2", name: "Villa", slug: "villa" } };
    if (has(c, ["eq", "id", "c2"])) return { data: { id: "c2", external_org_id: externalOrgId } };
    return { data: null };
  };

  it("CRITICAL: takes a free company only while it's still free", async () => {
    respond = target(null);
    expect(await linkSmartcardCompany("org1", "c2")).toEqual({ id: "c2", name: "Villa", slug: "villa", staleOrgId: null });
    const update = calls.find((c) => c.op === "update")!;
    expect(update.payload).toEqual({ external_org_id: "org1" });
    expect(has(update, ["eq", "id", "c2"])).toBe(true);
    expect(has(update, ["is", "external_org_id", null])).toBe(true);
  });

  it("repairs a broken link (points to an ID that isn't a Reymen client)", async () => {
    respond = target("old-org");
    expect(await linkSmartcardCompany("org1", "c2")).toMatchObject({ staleOrgId: "old-org" });
    const update = calls.find((c) => c.op === "update")!;
    expect(has(update, ["eq", "external_org_id", "old-org"])).toBe(true);
  });

  it("CRITICAL: never takes a company from another existing client", async () => {
    reymenOrgs = [{ id: "org2", name: "Lonier" }];
    respond = target("org2");
    await expect(linkSmartcardCompany("org1", "c2")).rejects.toThrow(/otro cliente/);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("fails when someone changed it in between", async () => {
    respond = (c) => (c.op === "update" ? { data: null } : target(null)(c));
    await expect(linkSmartcardCompany("org1", "c2")).rejects.toThrow(/otro cliente/);
  });

  it("refuses a second company for an already linked client", async () => {
    respond = (c) => (c.op === "select" && has(c, ["eq", "external_org_id", "org1"]) ? { data: { id: "c1" } } : { data: null });
    await expect(linkSmartcardCompany("org1", "c2")).rejects.toThrow(/ya está vinculado/);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });
});

describe("listSmartcardCompanies", () => {
  it("counts active members and live cards per company", async () => {
    reymenOrgs = [{ id: "org1", name: "Villa Gardenia" }];
    respond = (c) => {
      if (c.table === "companies") return { data: [{ id: "c1", name: "Villa", slug: "villa", external_org_id: "org1" }, { id: "c2", name: "X", slug: "x", external_org_id: "gone" }] };
      if (c.table === "company_users") return { data: [{ company_id: "c1" }, { company_id: "c1" }] };
      if (c.table === "clients") return { data: [{ id: "k1", company_id: "c1" }] };
      if (c.table === "cards") return { data: [{ client_id: "k1" }, { client_id: "k1" }, { client_id: "k1" }] };
      return { data: null };
    };
    expect(await listSmartcardCompanies()).toEqual([
      { id: "c1", name: "Villa", slug: "villa", link: { kind: "client", clientId: "org1", clientName: "Villa Gardenia" }, activeMembers: 2, cards: 3 },
      { id: "c2", name: "X", slug: "x", link: { kind: "stale", orgId: "gone" }, activeMembers: 0, cards: 0 },
    ]);
    expect(has(calls.find((c) => c.table === "company_users")!, ["eq", "status", "active"])).toBe(true);
    expect(has(calls.find((c) => c.table === "cards")!, ["is", "deleted_at", null])).toBe(true);
  });

  it("returns null without the Supabase env", async () => {
    configured = false;
    expect(await listSmartcardCompanies()).toBeNull();
  });
});

it("unlinkSmartcardCompany clears only this client's link", async () => {
  await unlinkSmartcardCompany("org1");
  expect(calls[0]).toMatchObject({ table: "companies", op: "update", payload: { external_org_id: null } });
  expect(has(calls[0], ["eq", "external_org_id", "org1"])).toBe(true);
});

describe("addSmartcardMember", () => {
  const linked = (c: Call) => {
    if (c.table === "companies") return { data: { id: "c1" } };
    if (c.table === "roles") return { data: { id: "r-owner" } };
    return { data: null };
  };

  it("creates the SmartCard user and an active membership", async () => {
    respond = linked;
    auth.admin.createUser.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    expect(await addSmartcardMember("org1", " Dueno@Villa.mx ", "owner")).toBe("added");
    expect(auth.admin.createUser.mock.calls[0][0]).toMatchObject({ email: "dueno@villa.mx", email_confirm: true });
    expect(calls.find((c) => c.op === "insert")!.payload).toEqual({ company_id: "c1", user_id: "u9", role_id: "r-owner", status: "active" });
  });

  it("reuses an existing user and reactivates their membership", async () => {
    respond = (c) => (c.table === "company_users" && c.op === "select" ? { data: { id: "m1" } } : linked(c));
    auth.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } });
    auth.admin.listUsers.mockResolvedValue({ data: { users: [{ id: "u1", email: "dueno@villa.mx" }] } });
    expect(await addSmartcardMember("org1", "dueno@villa.mx", "owner")).toBe("updated");
    const update = calls.find((c) => c.op === "update")!;
    expect(update.payload).toEqual({ role_id: "r-owner", status: "active" });
    expect(has(update, ["eq", "company_id", "c1"])).toBe(true);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("rolls back a user it created when the membership insert fails", async () => {
    respond = (c) => (c.op === "insert" ? { error: { message: "limit" } } : linked(c));
    auth.admin.createUser.mockResolvedValue({ data: { user: { id: "u9" } }, error: null });
    await expect(addSmartcardMember("org1", "x@villa.mx", "staff")).rejects.toThrow(/límite/);
    expect(auth.admin.deleteUser).toHaveBeenCalledWith("u9");
  });

  it("requires the client to be linked first", async () => {
    await expect(addSmartcardMember("org1", "x@villa.mx", "staff")).rejects.toThrow(/Primero vincula/);
    expect(auth.admin.createUser).not.toHaveBeenCalled();
  });
});

describe("removeSmartcardMember", () => {
  it("CRITICAL: deletes only within the client's own company", async () => {
    respond = (c) => (c.op === "delete" ? { data: [{ id: "m1" }] } : { data: { id: "c1" } });
    await removeSmartcardMember("org1", "m1");
    const del = calls.find((c) => c.op === "delete")!;
    expect(has(del, ["eq", "id", "m1"])).toBe(true);
    expect(has(del, ["eq", "company_id", "c1"])).toBe(true);
  });

  it("fails when the member isn't in that company", async () => {
    respond = (c) => (c.op === "delete" ? { data: [] } : { data: { id: "c1" } });
    await expect(removeSmartcardMember("org1", "other")).rejects.toThrow(/ya no existe/);
  });
});

describe("syncSmartcardMemberLimit", () => {
  const withModule = (limits: Record<string, unknown> | null) => (c: Call) => {
    if (c.table === "companies") return { data: { id: "c1" } };
    if (c.table === "modules") return { data: { id: "mod-sc" } };
    if (c.table === "company_modules" && c.op === "select") return { data: { module_id: "mod-sc", limits } };
    return { data: null };
  };

  it("sets max_team_members keeping the other limits, only on that company's module", async () => {
    respond = withModule({ max_team_members: 2, max_cards: 5 });
    expect(await syncSmartcardMemberLimit("org1", 10)).toBe("updated");
    const update = calls.find((c) => c.op === "update")!;
    expect(update).toMatchObject({ table: "company_modules", payload: { limits: { max_team_members: 10, max_cards: 5 } } });
    expect(has(update, ["eq", "company_id", "c1"])).toBe(true);
    expect(has(update, ["eq", "module_id", "mod-sc"])).toBe(true);
    expect(has(calls.find((c) => c.table === "modules")!, ["eq", "code", "smartcard"])).toBe(true);
  });

  it("removes the key for unlimited plans and skips when already equal", async () => {
    respond = withModule({ max_team_members: 2 });
    expect(await syncSmartcardMemberLimit("org1", null)).toBe("updated");
    expect(calls.find((c) => c.op === "update")!.payload).toEqual({ limits: {} });
    calls = [];
    expect(await syncSmartcardMemberLimit("org1", 2)).toBe("unchanged");
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("doesn't create anything when unlinked or without the module", async () => {
    expect(await syncSmartcardMemberLimit("org1", 10)).toBe("unlinked");
    respond = (c) => (c.table === "companies" ? { data: { id: "c1" } } : { data: null });
    expect(await syncSmartcardMemberLimit("org1", 10)).toBe("no_module");
    expect(calls.some((c) => c.op !== "select")).toBe(false);
  });

  it("maps Reymen plans to SmartCard limits", async () => {
    expect(await planMemberLimit("starter")).toBe(2);
    expect(await planMemberLimit("professional")).toBe(10);
    expect(await planMemberLimit("business")).toBeNull();
    expect(await planMemberLimit("unknown")).toBe(2);
  });
});

describe("createSmartcardCompanyForOrg", () => {
  const day = (n: number) => new Date(2026, 0, n);
  const wolf = {
    id: "org-wolf",
    name: "Taller Automotriz Wolf",
    slug: "taller-wolf",
    industry: "workshop",
    plan: "starter", // límite de 2 integrantes en el mock de planes
    users: [
      { email: "agente@wolf.mx", role: "AGENT", createdAt: day(1) },
      { email: "cliente@wolf.mx", role: "CLIENT", createdAt: day(1) },
      { email: "dueno@wolf.mx", role: "OWNER", createdAt: day(3) },
      { email: "admin@wolf.mx", role: "ADMIN", createdAt: day(2) },
    ],
  };

  // Simula SmartCard: la empresa existe solo después de insertarla.
  function smartcard(opts: { takenSlugs?: string[]; moduleFails?: boolean; alreadyLinked?: boolean } = {}) {
    let created: { id: string; name: string; slug: string } | null = null;
    let nextUser = 0;
    auth.admin.createUser.mockImplementation(async () => ({ data: { user: { id: `u${++nextUser}` } }, error: null }));
    respond = (c) => {
      if (c.table === "companies" && c.op === "insert") {
        const p = c.payload as { slug: string; name: string };
        if (opts.takenSlugs?.includes(p.slug)) return { data: null, error: { message: "dup", code: "23505" } as { message: string } };
        created = { id: "co-new", name: p.name, slug: p.slug };
        return { data: created };
      }
      if (c.table === "companies" && c.op === "select") {
        if (opts.alreadyLinked) return { data: { id: "co-old" } };
        return { data: created ? { id: created.id } : null };
      }
      if (c.table === "modules") return { data: { id: "mod-sc" } };
      if (c.table === "company_modules" && c.op === "insert") return opts.moduleFails ? { error: { message: "boom" } } : { data: null };
      if (c.table === "roles") return { data: { id: `role-${String(c.filters[0][2])}` } };
      return { data: null };
    };
  }

  it("creates the linked company with the module and gives access to owners and admins first, up to the plan limit", async () => {
    reymenOrgs = [wolf];
    smartcard();
    const r = await createSmartcardCompanyForOrg("org-wolf");

    expect(r.company).toMatchObject({ id: "co-new", name: "Taller Automotriz Wolf", slug: "taller-wolf" });
    const insert = calls.find((c) => c.table === "companies" && c.op === "insert")!;
    expect(insert.payload).toMatchObject({ external_org_id: "org-wolf", status: "active", industry: "workshop" });
    const mod = calls.find((c) => c.table === "company_modules" && c.op === "insert")!;
    expect(mod.payload).toMatchObject({ company_id: "co-new", module_id: "mod-sc", enabled: true, limits: { max_team_members: 2 } });
    expect(r.granted).toEqual(["dueno@wolf.mx", "admin@wolf.mx"]);
    expect(r.skipped).toEqual(["agente@wolf.mx"]); // fuera por el límite; CLIENT ni se considera
    const memberships = calls.filter((c) => c.table === "company_users" && c.op === "insert");
    expect(memberships.map((m) => (m.payload as { role_id: string }).role_id)).toEqual(["role-owner", "role-admin"]);
  });

  it("adds a suffix when the client's slug is already used in SmartCard", async () => {
    reymenOrgs = [wolf];
    smartcard({ takenSlugs: ["taller-wolf"] });
    const r = await createSmartcardCompanyForOrg("org-wolf");
    expect(r.company.slug).toBe("taller-wolf-reymen");
  });

  it("refuses a second company for an already linked client", async () => {
    reymenOrgs = [wolf];
    smartcard({ alreadyLinked: true });
    await expect(createSmartcardCompanyForOrg("org-wolf")).rejects.toThrow(/ya está vinculado/);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("deletes the company again when the module can't be enabled", async () => {
    reymenOrgs = [wolf];
    smartcard({ moduleFails: true });
    await expect(createSmartcardCompanyForOrg("org-wolf")).rejects.toThrow(/habilitar SmartCard/);
    const del = calls.find((c) => c.table === "companies" && c.op === "delete")!;
    expect(has(del, ["eq", "id", "co-new"])).toBe(true);
    expect(calls.some((c) => c.table === "company_users")).toBe(false);
  });

  it("maps Reymen roles to SmartCard roles", () => {
    expect(smartcardRoleForUserRole("OWNER")).toBe("owner");
    expect(smartcardRoleForUserRole("AGENT")).toBe("agent");
    expect(smartcardRoleForUserRole("VIEWER")).toBe("staff");
    expect(smartcardRoleForUserRole("CLIENT")).toBeNull();
    expect(smartcardRoleForUserRole("SUPER_ADMIN")).toBeNull();
  });
});

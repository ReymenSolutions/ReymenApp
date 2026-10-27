// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tarjetas por persona: quién crea, asigna y edita. Supabase es falso: cada
// consulta queda registrada y responde lo que diga `respond`.
interface Call {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, string, unknown][];
}
let calls: Call[] = [];
let respond: (c: Call) => { data?: unknown; error?: { message: string; code?: string } | null } = () => ({ data: null });

function query(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const b: Record<string, unknown> = {};
  const chain = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => (fn(...a), b);
  b.select = chain(() => {});
  b.order = chain(() => {});
  b.limit = chain(() => {});
  b.insert = chain((p) => ((call.op = "insert"), (call.payload = p)));
  b.update = chain((p) => ((call.op = "update"), (call.payload = p)));
  b.eq = chain((c, v) => call.filters.push(["eq", c as string, v]));
  b.in = chain((c, v) => call.filters.push(["in", c as string, v]));
  b.is = chain((c, v) => call.filters.push(["is", c as string, v]));
  const finish = () => {
    calls.push(call);
    return Promise.resolve({ error: null, ...respond(call) });
  };
  b.single = finish;
  b.maybeSingle = finish;
  b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => finish().then(ok, ko);
  return b;
}
const has = (c: Call, f: [string, string, unknown]) => c.filters.some((x) => x[0] === f[0] && x[1] === f[1] && x[2] === f[2]);

let role = "owner";
const themeColors = vi.fn(async () => ({ ok: true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { organizationId: "org1", email: "yo@t.mx" } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/actions/team", () => ({ inviteTeamMember: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ listCatalog: vi.fn(), resolveCatalogItem: vi.fn() }));
vi.mock("@/lib/smartcard-products", () => ({ listProfileProducts: vi.fn(), productColumns: vi.fn(), PRODUCT_LINK_TYPE: "product", MAX_PROFILE_PRODUCTS: 12 }));
vi.mock("@/lib/smartcard-link", () => ({ findOrCreateSmartcardAuthUser: vi.fn() }));
vi.mock("@/lib/smartcard-supabase", () => ({ getSmartcardAdminClient: () => ({ from: query }) }));
vi.mock("@/lib/smartcard-roster", () => ({
  getRosterPeople: async (_org: string, ids: string[]) => Object.fromEntries(ids.map((id) => [id, { name: "Ana Asesora", email: "ana@t.mx" }])),
}));
vi.mock("@/lib/smartcard-company", () => ({
  supportsCardAssignment: async () => true,
  resolveSmartcardMembership: async () => ({
    ok: true,
    membership: { companyId: "co1", companyName: "Terranuma", companySlug: "terranuma", userId: "me", roleCode: role, modules: ["smartcard"], limits: {} },
  }),
  getSmartcardProfile: async (profileId: string) => (profileId.startsWith("p") ? { profile: { id: profileId }, links: [] } : null),
  getProfileThemeInfo: async () => null,
  updateProfileThemeColors: (...a: unknown[]) => themeColors(...(a as [])),
  buildSmartcardPublicUrl: (c: string) => `https://link.reymen.mx/q/${c}`,
  setProfileTheme: vi.fn(),
}));

const { createSmartcardCardForMember, assignSmartcardCard, updateSmartcardProfile } = await import("./smartcard");

beforeEach(() => {
  calls = [];
  role = "owner";
  respond = () => ({ data: null });
  vi.clearAllMocks();
});

const profileInput = { displayName: "Ana Asesora", logoUrl: "https://otro-logo.png", primaryColor: "#ff0000" } as Parameters<typeof updateSmartcardProfile>[1];

describe("createSmartcardCardForMember", () => {
  it("creates the company holder, the person's profile with the company look, and the card assigned to them", async () => {
    respond = (c) => {
      if (c.table === "company_users") return { data: { id: "cu-ana" } };
      if (c.table === "clients" && c.op === "select") return { data: [] };
      if (c.table === "clients" && c.op === "insert") return { data: { id: "cl1" } };
      if (c.table === "profiles" && c.op === "select") return { data: { theme_id: "t-azul", theme_overrides: { primary: "#00174C" }, logo_url: "https://logo.png" } };
      if (c.table === "profiles" && c.op === "insert") return { data: { id: "prof-ana" } };
      if (c.table === "cards" && c.op === "insert") return { data: { id: "card-ana", card_code: "REY-000042" } };
      return { data: null };
    };
    const r = await createSmartcardCardForMember("ana");
    expect(r).toEqual({ success: true, cardCode: "REY-000042", profileId: "prof-ana" });

    expect(calls.find((c) => c.table === "clients" && c.op === "insert")!.payload).toMatchObject({ company_id: "co1", name: "Terranuma" });
    expect(calls.find((c) => c.table === "profiles" && c.op === "insert")!.payload).toMatchObject({
      client_id: "cl1",
      display_name: "Ana Asesora",
      email: "ana@t.mx",
      company: "Terranuma",
      theme_id: "t-azul",
      logo_url: "https://logo.png",
    });
    expect(calls.find((c) => c.table === "cards" && c.op === "insert")!.payload).toMatchObject({
      client_id: "cl1",
      profile_id: "prof-ana",
      destination_type: "PROFILE",
      assigned_user_id: "ana",
    });
  });

  it("gives one card per person", async () => {
    respond = (c) => {
      if (c.table === "company_users") return { data: { id: "cu-ana" } };
      if (c.table === "clients") return { data: [{ id: "cl1" }] };
      if (c.table === "cards") return { data: [{ id: "card-old" }] };
      return { data: null };
    };
    const r = await createSmartcardCardForMember("ana");
    expect(r).toEqual({ success: false, error: "Esa persona ya tiene su tarjeta." });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("CRITICAL: only owner, admin or manager can create cards", async () => {
    role = "agent";
    const r = await createSmartcardCardForMember("ana");
    expect(r.success).toBe(false);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("refuses someone who isn't an active member of the company", async () => {
    respond = () => ({ data: null });
    const r = await createSmartcardCardForMember("extraño");
    expect(r).toEqual({ success: false, error: "Esa persona no es integrante activo de tu empresa en SmartCard." });
  });
});

describe("assignSmartcardCard", () => {
  it("CRITICAL: never touches a card from another company", async () => {
    respond = (c) => (c.table === "cards" && c.op === "select" ? { data: { id: "card-x", clients: { company_id: "otra" } } } : { data: null });
    const r = await assignSmartcardCard("card-x", null);
    expect(r).toEqual({ success: false, error: "Esa tarjeta no pertenece a tu empresa." });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("assigns a company card to an active member", async () => {
    respond = (c) => {
      if (c.table === "cards" && c.op === "select") return { data: { id: "card1", clients: { company_id: "co1" } } };
      if (c.table === "company_users") return { data: { id: "cu-ana" } };
      return { data: null };
    };
    expect(await assignSmartcardCard("card1", "ana")).toEqual({ success: true });
    const upd = calls.find((c) => c.table === "cards" && c.op === "update")!;
    expect(upd.payload).toMatchObject({ assigned_user_id: "ana" });
    expect(has(upd, ["eq", "id", "card1"])).toBe(true);
  });
});

describe("updateSmartcardProfile by an agent", () => {
  it("edits their own profile but not the company's design or logo", async () => {
    role = "agent";
    respond = (c) => (c.table === "cards" ? { data: [{ id: "my-card" }] } : { data: null });
    const r = await updateSmartcardProfile("p-mine", profileInput);
    expect(r).toEqual({ success: true });
    const upd = calls.find((c) => c.table === "profiles" && c.op === "update")!;
    expect(upd.payload).toMatchObject({ display_name: "Ana Asesora" });
    expect(upd.payload).not.toHaveProperty("logo_url");
    expect(themeColors).not.toHaveBeenCalled();
    const check = calls.find((c) => c.table === "cards")!;
    expect(has(check, ["eq", "assigned_user_id", "me"])).toBe(true);
  });

  it("CRITICAL: can't edit someone else's profile", async () => {
    role = "agent";
    respond = (c) => (c.table === "cards" ? { data: [] } : { data: null });
    const r = await updateSmartcardProfile("p-other", profileInput);
    expect(r).toEqual({ success: false, error: "Solo puedes editar el perfil de tu propia tarjeta." });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("a manager still edits the design", async () => {
    const r = await updateSmartcardProfile("p-any", profileInput);
    expect(r).toEqual({ success: true });
    expect(themeColors).toHaveBeenCalled();
    expect(calls.find((c) => c.table === "profiles" && c.op === "update")!.payload).toHaveProperty("logo_url", "https://otro-logo.png");
  });
});

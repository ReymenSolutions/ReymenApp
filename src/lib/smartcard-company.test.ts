// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const responses: Record<string, { data: unknown[] | null; error: { message: string } | null }> = {};
vi.mock("./smartcard-supabase", () => ({ getSmartcardAdminClient: () => ({
  from: (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "in", "is", "order", "limit"]) builder[name] = () => builder;
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(responses[table]).then(resolve);
    return builder;
  },
}) }));
import { getCompanyCardStats } from "./smartcard-company";
beforeEach(() => {
  responses.clients = { data: [{ id: "client", name: "Sample" }], error: null };
  responses.cards = { data: [{ id: "card", client_id: "client", card_code: "CARD", status: "active" }], error: null };
  responses.events = { data: [], error: null };
});
describe("SmartCard error vs empty state", () => {
  it.each(["clients", "cards", "events"])("surfaces %s failures to the portal boundary", async table => {
    responses[table] = { data: null, error: { message: "unavailable" } };
    await expect(getCompanyCardStats("company", { throwOnError: true })).rejects.toThrow("Unable to load");
  });
  it("keeps a successful empty result distinct from a query failure", async () => {
    responses.clients = { data: [], error: null };
    expect(await getCompanyCardStats("company", { throwOnError: true })).toEqual({ totalCards: 0, totalEvents: 0, byType: {}, cards: [] });
  });
});

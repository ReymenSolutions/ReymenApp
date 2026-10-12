// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { computeCost, toMxn } from "./cost";
import { runAiCall, findRate } from "./gateway";
import { setAnthropicClientForTests } from "./providers/anthropic";
import { resetExchangeRateCache } from "@/lib/exchange-rate";

const D = (v: string | number) => new Prisma.Decimal(v);
const usageBody = (u: object = {}) => ({ id: "msg_1", model: "claude-test-20261001", stop_reason: "end_turn", content: [{ type: "text", text: "Hola" }], usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 400, ...u } });
const ctx = (orgId: string, over: object = {}) => ({ organizationId: orgId, agentKey: "inbox:whatsapp", operation: "draft", origin: "whatsapp", ...over });
const input = { system: "s", messages: [{ role: "user" as const, content: "hola" }], maxOutputTokens: 100 };

describe("costo (decimal)", () => {
  const rate = { inputPerMTok: D(3), outputPerMTok: D(15), cacheReadPerMTok: D("0.3"), cacheWritePerMTok: D("3.75"), reasoningPerMTok: null };
  it("suma entrada, salida, caché y razonamiento con su tarifa, sin errores de flotantes", () => {
    const cost = computeCost({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 400, reasoningTokens: 100 }, rate);
    // 0.003 + 0.003 + 0.0015 + 0.0015 + (100 de razonamiento a tarifa de salida = 0.0015)
    expect(cost.toString()).toBe("0.0105");
  });
  it("sin tarifa de caché se cobra como entrada; USD→MXN con tipo de cambio; moneda desconocida = null (no se inventa)", () => {
    expect(computeCost({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, reasoningTokens: 0 }, { ...rate, cacheReadPerMTok: null }).toString()).toBe("3");
    expect(toMxn(D("0.0105"), "USD", 20)?.toString()).toBe("0.21");
    expect(toMxn(D(5), "MXN", null)?.toString()).toBe("5");
    expect(toMxn(D(5), "EUR", 20)).toBeNull();
    expect(toMxn(D(5), "USD", null)).toBeNull();
  });
});

describe("gateway de IA: ledger por tenant", () => {
  let org: { id: string };
  let other: { id: string };
  const create = vi.fn();
  const rows = (orgId: string) => prisma.aiUsage.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    org = await createTestOrg("AI Ledger Org");
    other = await createTestOrg("AI Ledger Other");
  });
  afterAll(async () => {
    await prisma.aiRate.deleteMany({ where: { source: "test" } });
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });
  beforeEach(async () => {
    create.mockReset();
    resetExchangeRateCache();
    vi.stubEnv("MXN_PER_USD", "20");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_DRAFT_MODEL", "claude-test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    setAnthropicClientForTests({ beta: { messages: { create } } } as never);
    await prisma.aiUsage.deleteMany({ where: { organizationId: { in: [org.id, other.id] } } });
    await prisma.aiRate.deleteMany({ where: { source: "test" } });
  });
  afterEach(() => {
    setAnthropicClientForTests(null);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const addRate = (over: object = {}) => prisma.aiRate.create({ data: { provider: "anthropic", model: "claude-test", inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75, effectiveFrom: new Date("2026-01-01"), source: "test", ...over } });

  it("registra tokens (entrada, salida, caché), tarifa, tipo de cambio y costo en MXN, sin guardar el contenido", async () => {
    const rate = await addRate();
    create.mockResolvedValue(usageBody());
    const out = await runAiCall(ctx(org.id, { conversationId: "c1", requestId: "r1", traceId: "t1" }), input);
    expect(out).toMatchObject({ text: "Hola", model: "claude-test-20261001", inputTokens: 1000, outputTokens: 200 });
    const [row] = await rows(org.id);
    expect(row).toMatchObject({ status: "SUCCEEDED", provider: "anthropic", model: "claude-test", modelServed: "claude-test-20261001", inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 400, costBasis: "ESTIMATED", rateId: rate.id, currencyOriginal: "USD", conversationId: "c1", traceId: "t1", externalId: "msg_1", byok: false });
    // 0.003 + 0.003 + 0.0015 + 0.0015 = 0.009 USD → 0.18 MXN a 20
    expect(row.costOriginal?.toString()).toBe("0.009");
    expect(row.costMxn?.toString()).toBe("0.18");
    expect(row.fxRate?.toString()).toBe("20");
    expect(row.fxSource).toBe("env");
    expect(JSON.stringify(row)).not.toMatch(/hola|"s"/i);
    expect(row.completedAt).not.toBeNull();
  });

  it("sin tarifa vigente NO inventa el costo: queda 'sin tarifa'; usa la tarifa con la vigencia correcta", async () => {
    create.mockResolvedValue(usageBody());
    await runAiCall(ctx(org.id, { requestId: "a" }), input);
    expect((await rows(org.id))[0]).toMatchObject({ costBasis: "NO_RATE", costOriginal: null, costMxn: null, rateId: null });
    const old = await addRate({ effectiveFrom: new Date("2026-01-01") });
    const next = await addRate({ effectiveFrom: new Date("2026-06-01"), inputPerMTok: 6 });
    await addRate({ effectiveFrom: new Date("2099-01-01"), inputPerMTok: 100 }); // futura: no aplica todavía
    expect((await findRate("anthropic", "claude-test", new Date("2026-03-01")))?.id).toBe(old.id);
    expect((await findRate("anthropic", "claude-test", new Date()))?.id).toBe(next.id);
  });

  it("una conversación con varias llamadas suma todas, sin duplicar; el costo de un tenant no aparece en otro", async () => {
    await addRate();
    create.mockResolvedValue(usageBody());
    await runAiCall(ctx(org.id, { conversationId: "conv", requestId: "x1" }), input);
    await runAiCall(ctx(org.id, { conversationId: "conv", requestId: "x2", operation: "auto_reply" }), input);
    await runAiCall(ctx(other.id, { conversationId: "conv", requestId: "x1" }), input); // misma llave en OTRO tenant: es otra llamada
    const agg = await prisma.aiUsage.aggregate({ where: { organizationId: org.id, conversationId: "conv" }, _sum: { costMxn: true, inputTokens: true }, _count: { _all: true } });
    expect(agg._count._all).toBe(2);
    expect(agg._sum.inputTokens).toBe(2000);
    expect(agg._sum.costMxn?.toString()).toBe("0.36");
    expect(await rows(other.id)).toHaveLength(1);
  });

  it("idempotencia: la misma llamada lógica no se vuelve a hacer ni a cobrar (ni en paralelo)", async () => {
    create.mockResolvedValue(usageBody());
    await runAiCall(ctx(org.id, { requestId: "dup" }), input);
    await expect(runAiCall(ctx(org.id, { requestId: "dup" }), input)).rejects.toThrow("ai_duplicate_request");
    expect(create).toHaveBeenCalledTimes(1);

    create.mockClear();
    const results = await Promise.allSettled([runAiCall(ctx(org.id, { requestId: "par" }), input), runAiCall(ctx(org.id, { requestId: "par" }), input), runAiCall(ctx(org.id, { requestId: "par" }), input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await prisma.aiUsage.count({ where: { organizationId: org.id, requestId: "par" } })).toBe(1);
  });

  it("un error del proveedor queda registrado como FAILED y se propaga; un rechazo del modelo como REFUSED", async () => {
    create.mockRejectedValueOnce(new Error("overloaded"));
    await expect(runAiCall(ctx(org.id, { requestId: "e1" }), input)).rejects.toThrow("overloaded");
    create.mockResolvedValueOnce(usageBody({ output_tokens: 3 }) && { ...usageBody({ output_tokens: 3 }), stop_reason: "refusal" });
    expect(await runAiCall(ctx(org.id, { requestId: "e2" }), input)).toMatchObject({ refused: true });
    const [failed, refused] = await rows(org.id);
    expect(failed).toMatchObject({ status: "FAILED", errorCode: "overloaded", inputTokens: 0 });
    expect(refused).toMatchObject({ status: "REFUSED", outputTokens: 3 }); // lo parcialmente facturable sí se cuenta
  });

  it("exige tenant y modelo", async () => {
    await expect(runAiCall(ctx("", { requestId: "n" }), input)).rejects.toThrow("ai_gateway_missing_tenant");
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("AI_OPENAI_MODEL", "");
    await expect(runAiCall(ctx(org.id, { requestId: "m" }), input)).rejects.toThrow("ai_model_not_configured");
    expect(await rows(org.id)).toHaveLength(0);
  });

  it("OpenAI: separa lo cacheado y el razonamiento; la llave nunca sale del servidor (se manda solo en el encabezado a OpenAI)", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("AI_OPENAI_MODEL", "oa-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    await addRate({ provider: "openai", model: "oa-test", inputPerMTok: 2, outputPerMTok: 8, cacheReadPerMTok: 0.5 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "cmpl_1", model: "oa-test-2026", choices: [{ message: { content: "Hola OA" }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 400 }, completion_tokens_details: { reasoning_tokens: 100 } } }) });
    vi.stubGlobal("fetch", fetchMock);
    const out = await runAiCall(ctx(org.id, { requestId: "oa1" }), input);
    expect(out).toMatchObject({ text: "Hola OA", model: "oa-test-2026" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-test");
    const [row] = await rows(org.id);
    expect(row).toMatchObject({ provider: "openai", inputTokens: 600, cacheReadTokens: 400, outputTokens: 200, reasoningTokens: 100, costBasis: "ESTIMATED" });
    // 600×2 + 200×8 + 400×0.5 + 100×8 (razonamiento a tarifa de salida) = 1200+1600+200+800 = 3800 / 1e6
    expect(row.costOriginal?.toString()).toBe("0.0038");
  });
});

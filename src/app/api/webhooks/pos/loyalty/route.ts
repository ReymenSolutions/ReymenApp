import { posRewards, posRewardsSchema } from "@/lib/loyalty/pos-rewards";
import { getVisitPolicy, setVisitPolicy, visitPolicySchema } from "@/lib/loyalty/visit-policy";
import { posRedemption, redemptionSchema } from "@/lib/loyalty/redemption";
import { UserError } from "@/lib/user-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWebhookAuthorized } from "@/lib/webhook-validator";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasModule } from "@/lib/modules";
import { lookupCustomerForPos, lookupMemberForPos, parsePosLoyalty } from "@/lib/loyalty/pos";

// Authenticated POS lookup and quote/reserve/release contract. Reservations are
// audited and idempotent by organization/order; sales settle through domain events.
// The legacy {code} or {phone} lookup remains read-only.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-reymen-signature") ?? "";
  const timestamp = req.headers.get("x-reymen-timestamp") ?? "";
  const plainSecret = req.headers.get("x-reymen-secret") ?? "";
  const orgId = req.headers.get("x-reymen-orgid") ?? "";
  const rawBody = await req.text();

  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, n8nWebhookSecret: true, isActive: true } }) : null;
  if (!org || !org.isActive || !isWebhookAuthorized(rawBody, signature, plainSecret, org.n8nWebhookSecret, timestamp)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`webhook:pos-loyalty:${orgId}`, { limit: 240, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }


  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body && typeof body === "object" && "action" in body && (body.action === "policy.read" || body.action === "policy.write")) {
    if (!(await hasModule(orgId, "REYMEN_POS")) || !(await hasModule(orgId, "LOYALTY"))) return NextResponse.json({ error: "POS o Lealtad no habilitado" }, { status: 403 });
    if (body.action === "policy.read") return NextResponse.json(await getVisitPolicy(orgId), { headers: { "Cache-Control": "no-store" } });
    const input = body as Record<string, unknown>;
    const parsed = visitPolicySchema.safeParse(input.policy);
    if (!parsed.success || input.actorRole !== "admin" || typeof input.employeeId !== "string" || !input.employeeId || typeof input.deviceId !== "string" || !input.deviceId) return NextResponse.json({ error: "Configuración o autorización inválida" }, { status: 400 });
    return NextResponse.json(await setVisitPolicy(orgId, parsed.data, { deviceId: input.deviceId, employeeId: input.employeeId }), { headers: { "Cache-Control": "no-store" } });
  }

  if (body && typeof body === "object" && "action" in body && (body.action === "rewards.list" || body.action === "reward.redeem")) {
    if (!(await hasModule(orgId, "REYMEN_POS")) || !(await hasModule(orgId, "LOYALTY"))) return NextResponse.json({ error: "POS o Lealtad no habilitado" }, { status: 403 });
    const parsed = posRewardsSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos de canje inválidos" }, { status: 400 });
    try { return NextResponse.json(await posRewards(orgId, parsed.data), { headers: { "Cache-Control": "no-store" } }); }
    catch (e) { if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 409 }); throw e; }
  }

  if (body && typeof body === "object" && "action" in body && body.action === "lookup") {
    if (!(await hasModule(orgId, "REYMEN_POS"))) return NextResponse.json({ error: "POS no habilitado" }, { status: 403 });
    const result = await lookupCustomerForPos(orgId, "phone" in body ? body.phone : null);
    return NextResponse.json(result, { status: result.status === "invalid_request" ? 400 : 200, headers: { "Cache-Control": "no-store" } });
  }

  if (!(body && typeof body === "object" && "action" in body && body.action === "release") && !(await hasModule(orgId, "LOYALTY"))) {
    return NextResponse.json({ error: "Lealtad no está activada para este negocio.", code: "loyalty_module_disabled" }, { status: 403 });
  }

  if (body && typeof body === "object" && "action" in body) {
    if (body.action !== "release" && !(await hasModule(orgId, "REYMEN_POS"))) return NextResponse.json({ error: "POS no habilitado" }, { status: 403 });
    const parsed = redemptionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos de canje inválidos" }, { status: 400 });
    try { return NextResponse.json(await posRedemption(orgId, parsed.data), { headers: { "Cache-Control": "no-store" } }); }
    catch (e) { if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 409 }); throw e; }
  }
  const result = await lookupMemberForPos(orgId, parsePosLoyalty(body));
  return NextResponse.json(result, { status: result.status === "invalid_request" ? 400 : 200 });
}

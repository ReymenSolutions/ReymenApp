import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { UserError } from "@/lib/user-error";
import { getWolfLandingOrg, submitWolfInquiry, wolfInquirySchema } from "@/lib/workshop/landing";

const MAX_BODY_BYTES = 8 * 1024;

async function smallJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("Body too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "origin" }, { status: 403 });
  const org = await getWolfLandingOrg();
  if (!org) return NextResponse.json({ error: "unavailable" }, { status: 404 });
  const ip = clientIp(request) ?? "unknown";
  const limit = await checkRateLimit(`workshop-wolf-inquiry:${ip}`, { limit: 6, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: unknown;
  try { body = await smallJson(request); }
  catch { return NextResponse.json({ error: "invalid" }, { status: 400 }); }
  const parsed = wolfInquirySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ success: true });
  try {
    const result = await submitWolfInquiry(org.id, parsed.data);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof UserError) return NextResponse.json({ error: "capacity" }, { status: 422 });
    console.error("[workshop/inquiry]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

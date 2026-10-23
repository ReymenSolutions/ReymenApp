import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createHash } from "node:crypto";
import { postPrivateVisitor, privateChatEnabled, readPrivateVisitor } from "@/lib/ai/pilot/chat";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
async function token(request: NextRequest) {
  if (!privateChatEnabled()) throw new Error("unavailable");
  const value = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!value) throw new Error("unavailable");
  const limit = await checkRateLimit(`mark-chat:${createHash("sha256").update(value).digest("hex")}`, { limit: 120, windowMs: 60000 });
  if (!limit.allowed) throw new Error("limited");
  return value;
}
async function boundedJson(request: NextRequest) {
  if (!request.body || !request.headers.get("content-type")?.startsWith("application/json")) throw new Error("invalid");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; length += item.value.byteLength; if (length > 4096) throw new Error("invalid"); chunks.push(item.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
function failure(error: unknown) {
  return NextResponse.json({ error: "Chat no disponible. Comprueba el enlace privado y su vigencia." }, { status: error instanceof Error && error.message === "limited" ? 429 : 404, headers });
}
export async function GET(request: NextRequest) { try { return NextResponse.json(await readPrivateVisitor(await token(request)), { headers }); } catch (error) { return failure(error); } }
export async function POST(request: NextRequest) { try { const key = await token(request); return NextResponse.json(await postPrivateVisitor(key, await boundedJson(request)), { headers }); } catch (error) { return failure(error); } }

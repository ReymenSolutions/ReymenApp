import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appleWalletConfig, buildPkpass, checkAppleAuth } from "@/lib/loyalty/wallet-apple";
import { getWalletPassDataById } from "@/lib/loyalty/wallet-data";

// Servicio web de Apple Wallet (PassKit Web Service). Apple lo llama solo:
//   POST   devices/<device>/registrations/<passType>/<serial>   registrar iPhone (pushToken)
//   DELETE devices/<device>/registrations/<passType>/<serial>   quitar el pase
//   GET    devices/<device>/registrations/<passType>?passesUpdatedSince=<tag>   qué pases cambiaron
//   GET    passes/<passType>/<serial>                           el pase actualizado
//   POST   log                                                  errores del iPhone
// El serial es el id del miembro y se autentica con "ApplePass <token>" (ver appleAuthToken).
export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };
const empty = (status: number) => new NextResponse(null, { status });

export async function POST(req: Request, ctx: Ctx) {
  const cfg = appleWalletConfig();
  if (!cfg) return empty(404);
  const path = (await ctx.params).path;
  if (path[0] === "log") {
    const body = (await req.json().catch(() => null)) as { logs?: string[] } | null;
    for (const line of (body?.logs ?? []).slice(0, 20)) console.warn("[wallet-apple] iPhone:", String(line).slice(0, 300));
    return empty(200);
  }
  const [devices, deviceLibraryId, registrations, passTypeId, serial] = path;
  if (devices !== "devices" || registrations !== "registrations" || !deviceLibraryId || !serial || passTypeId !== cfg.passTypeId) return empty(404);
  if (!checkAppleAuth(serial, req.headers.get("authorization"))) return empty(401);
  const body = (await req.json().catch(() => null)) as { pushToken?: string } | null;
  const pushToken = body?.pushToken?.trim();
  if (!pushToken || pushToken.length > 200) return empty(400);
  const member = await prisma.loyaltyMember.findUnique({ where: { id: serial }, select: { id: true } });
  if (!member) return empty(401);
  const key = { deviceLibraryId_passTypeId_memberId: { deviceLibraryId: deviceLibraryId.slice(0, 200), passTypeId, memberId: serial } };
  const existing = await prisma.loyaltyWalletDevice.findUnique({ where: key, select: { id: true } });
  if (existing) {
    await prisma.loyaltyWalletDevice.update({ where: key, data: { pushToken } });
    return empty(200);
  }
  await prisma.loyaltyWalletDevice.create({ data: { deviceLibraryId: deviceLibraryId.slice(0, 200), passTypeId, memberId: serial, pushToken } });
  return empty(201);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const cfg = appleWalletConfig();
  if (!cfg) return empty(404);
  const [devices, deviceLibraryId, registrations, passTypeId, serial] = (await ctx.params).path;
  if (devices !== "devices" || registrations !== "registrations" || !deviceLibraryId || !serial || passTypeId !== cfg.passTypeId) return empty(404);
  if (!checkAppleAuth(serial, req.headers.get("authorization"))) return empty(401);
  await prisma.loyaltyWalletDevice.deleteMany({ where: { deviceLibraryId, passTypeId, memberId: serial } });
  return empty(200);
}

export async function GET(req: Request, ctx: Ctx) {
  const cfg = appleWalletConfig();
  if (!cfg) return empty(404);
  const path = (await ctx.params).path;

  if (path[0] === "passes") {
    const [, passTypeId, serial] = path;
    if (passTypeId !== cfg.passTypeId || !serial) return empty(404);
    if (!checkAppleAuth(serial, req.headers.get("authorization"))) return empty(401);
    const data = await getWalletPassDataById(serial);
    if (!data) return empty(404);
    const since = req.headers.get("if-modified-since");
    if (since && Math.floor(data.updatedAt.getTime() / 1000) <= Math.floor(new Date(since).getTime() / 1000)) return empty(304);
    const pkpass = await buildPkpass(data, cfg);
    return new NextResponse(new Uint8Array(pkpass), {
      headers: { "Content-Type": "application/vnd.apple.pkpass", "Last-Modified": data.updatedAt.toUTCString(), "Cache-Control": "no-store" },
    });
  }

  const [devices, deviceLibraryId, registrations, passTypeId] = path;
  if (devices !== "devices" || registrations !== "registrations" || !deviceLibraryId || passTypeId !== cfg.passTypeId) return empty(404);
  const rows = await prisma.loyaltyWalletDevice.findMany({ where: { deviceLibraryId, passTypeId }, select: { memberId: true } });
  if (rows.length === 0) return empty(204);
  const sinceTag = Number(new URL(req.url).searchParams.get("passesUpdatedSince") ?? "0") || 0;
  let latest = sinceTag;
  const serialNumbers: string[] = [];
  for (const { memberId } of rows) {
    const data = await getWalletPassDataById(memberId);
    if (!data) continue;
    const t = data.updatedAt.getTime();
    if (t > sinceTag) serialNumbers.push(memberId);
    latest = Math.max(latest, t);
  }
  if (serialNumbers.length === 0) return empty(204);
  return NextResponse.json({ serialNumbers, lastUpdated: String(latest) });
}

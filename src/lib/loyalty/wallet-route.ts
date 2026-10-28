import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/app-url";
import { memberCardPath, TOKEN_PATTERN } from "./token";
import { getWalletPassDataByToken } from "./wallet-data";
import { appleWalletConfig, buildPkpass } from "./wallet-apple";
import { googleSaveUrl, googleWalletConfig, upsertGoogleObjects } from "./wallet-google";

const noStore = { "Cache-Control": "no-store" };

export type WalletErrorCode = "unavailable" | "not_configured" | "limited";
export const WALLET_ERROR_CODES: readonly WalletErrorCode[] = ["unavailable", "not_configured", "limited"];

/**
 * El cliente llega aquí tocando un botón en su tarjeta: si algo falla, se le
 * regresa a la tarjeta con un aviso (?wallet=<código>) en vez de mostrarle
 * un JSON o descargarle un archivo.
 */
function backToCard(params: { slug: string; token: string }, code: WalletErrorCode) {
  const url = `${getAppUrl()}${memberCardPath(params.slug, params.token)}?wallet=${code}`;
  return NextResponse.redirect(url, { status: 303, headers: noStore });
}

async function resolve(params: { slug: string; token: string }) {
  if (!TOKEN_PATTERN.test(params.token)) return null;
  const limit = await checkRateLimit(`wallet:${params.token}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!limit.allowed) return "limited" as const;
  return getWalletPassDataByToken(params.slug, params.token);
}

/** /lealtad/<negocio>/tarjeta/<token>/wallet/apple → el .pkpass firmado. */
export async function appleWalletResponse(params: { slug: string; token: string }) {
  const cfg = appleWalletConfig();
  if (!cfg) return backToCard(params, "not_configured");
  const data = await resolve(params);
  if (data === "limited") return backToCard(params, "limited");
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  let pkpass: Buffer;
  try {
    pkpass = await buildPkpass(data, cfg);
  } catch (err) {
    console.error("[wallet-apple] No se pudo armar el pase:", err instanceof Error ? err.message : err);
    return backToCard(params, "unavailable");
  }
  return new NextResponse(new Uint8Array(pkpass), {
    headers: {
      ...noStore,
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="tarjeta-${params.slug}.pkpass"`,
      "Last-Modified": data.updatedAt.toUTCString(),
    },
  });
}

/** /lealtad/<negocio>/tarjeta/<token>/wallet/google → crea/actualiza el pase y manda a "Guardar en Google Wallet". */
export async function googleWalletResponse(params: { slug: string; token: string }) {
  const cfg = googleWalletConfig();
  if (!cfg) return backToCard(params, "not_configured");
  const data = await resolve(params);
  if (data === "limited") return backToCard(params, "limited");
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  try {
    await upsertGoogleObjects(data, cfg);
  } catch (err) {
    console.error("[wallet-google] No se pudo crear el pase:", err instanceof Error ? err.message : err);
    return backToCard(params, "unavailable");
  }
  return NextResponse.redirect(googleSaveUrl(data, cfg), { status: 303, headers: noStore });
}

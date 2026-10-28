import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { TOKEN_PATTERN } from "./token";
import { getWalletPassDataByToken } from "./wallet-data";
import { appleWalletConfig, buildPkpass } from "./wallet-apple";
import { googleSaveUrl, googleWalletConfig, upsertGoogleObjects } from "./wallet-google";

const noStore = { "Cache-Control": "no-store" };

function notConfigured(provider: "apple" | "google") {
  return NextResponse.json(
    { error: "wallet_not_configured", provider, message: "Wallet todavía no está conectado en este servidor. La tarjeta web sigue funcionando igual." },
    { status: 501, headers: noStore }
  );
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
  if (!cfg) return notConfigured("apple");
  const data = await resolve(params);
  if (data === "limited") return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  const pkpass = await buildPkpass(data, cfg);
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
  if (!cfg) return notConfigured("google");
  const data = await resolve(params);
  if (data === "limited") return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  try {
    await upsertGoogleObjects(data, cfg);
  } catch (err) {
    console.error("[wallet-google] No se pudo crear el pase:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "wallet_unavailable", message: "Google Wallet no respondió. Intenta de nuevo en unos minutos." }, { status: 502, headers: noStore });
  }
  return NextResponse.redirect(googleSaveUrl(data, cfg), { status: 303, headers: noStore });
}

import { NextResponse } from "next/server";
import { getPublicCard } from "./service";
import { TOKEN_PATTERN } from "./token";
import { getWalletAvailability, type WalletAvailability } from "./wallet";

/**
 * Respuesta de las rutas /wallet/{apple,google} mientras no haya credenciales:
 * 404 si la tarjeta no existe, 501 "no configurado" si existe. Cuando se
 * conecten las credenciales, aquí se firma el pase / se arma el JWT con
 * buildWalletCard() en lugar de devolver 501.
 */
export async function walletNotConfiguredResponse(provider: keyof WalletAvailability, params: { slug: string; token: string }) {
  if (!TOKEN_PATTERN.test(params.token)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const card = await getPublicCard(params.slug, params.token);
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const configured = getWalletAvailability()[provider];
  return NextResponse.json(
    {
      error: "wallet_not_configured",
      provider,
      configured,
      message: "La integración con Wallet todavía no está implementada. La tarjeta web sigue siendo la fuente de verdad.",
    },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

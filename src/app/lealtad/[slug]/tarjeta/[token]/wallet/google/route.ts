import { googleWalletResponse } from "@/lib/loyalty/wallet-route";

// "Guardar en Google Wallet" (ver src/lib/loyalty/wallet-google.ts).
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return googleWalletResponse(await ctx.params);
}

import { walletNotConfiguredResponse } from "@/lib/loyalty/wallet-route";

// Enlace "Save to Google Wallet". Pendiente de credenciales (ver src/lib/loyalty/wallet.ts).
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return walletNotConfiguredResponse("google", await ctx.params);
}

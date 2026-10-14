import { walletNotConfiguredResponse } from "@/lib/loyalty/wallet-route";

// Pase .pkpass de Apple Wallet. Pendiente de credenciales (ver src/lib/loyalty/wallet.ts).
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return walletNotConfiguredResponse("apple", await ctx.params);
}

import { appleWalletResponse } from "@/lib/loyalty/wallet-route";

// Pase .pkpass de Apple Wallet (ver src/lib/loyalty/wallet-apple.ts).
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; token: string }> }) {
  return appleWalletResponse(await ctx.params);
}

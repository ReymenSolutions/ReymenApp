import { prisma } from "@/lib/prisma";
import { cardStyle } from "@/lib/loyalty/card-style";
import { renderIconPng } from "@/lib/loyalty/wallet-images";

// Logo del programa para Google Wallet (lo descarga Google): el ícono de la tarjeta en su color.
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ programId: string }> }) {
  const { programId } = await ctx.params;
  const program = await prisma.loyaltyProgram.findUnique({ where: { id: programId }, select: { cardColor: true, cardAccent: true, cardIcon: true } });
  if (!program) return new Response("not found", { status: 404 });
  const style = cardStyle(program);
  const png = await renderIconPng(style.icon, style.accent, style.onAccent, 660, true);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}

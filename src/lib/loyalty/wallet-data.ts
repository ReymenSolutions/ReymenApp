// Datos de un pase de Wallet (Apple o Google) para un miembro de Lealtad.
// La fuente de verdad sigue siendo la base de Reymen: el pase solo refleja
// el estado en el momento en que se genera o se actualiza.

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { firstName, memberCardPath } from "./token";
import { cardStyle, type CardStyle } from "./card-style";
import { buildWalletCard, type WalletCard } from "./wallet";

export interface WalletPassData {
  memberId: string;
  programId: string;
  businessName: string;
  logoUrl: string | null;
  programName: string;
  rewardName: string;
  cycleVisits: number;
  visitGoal: number;
  availableRewards: number;
  memberSince: Date;
  cardUrl: string;
  style: CardStyle;
  card: WalletCard;
  /** Cambia cada vez que cambia algo del pase (Apple lo usa para saber si actualizar). */
  updatedAt: Date;
}

const MEMBER_SELECT = {
  id: true,
  organizationId: true,
  programId: true,
  name: true,
  publicToken: true,
  cycleVisits: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { rewards: { where: { status: "AVAILABLE" as const } } } },
  organization: { select: { name: true, slug: true, logoUrl: true } },
} as const;

async function toPassData(member: {
  id: string;
  organizationId: string;
  programId: string;
  name: string;
  publicToken: string;
  cycleVisits: number;
  createdAt: Date;
  updatedAt: Date;
  _count: { rewards: number };
  organization: { name: string; slug: string; logoUrl: string | null };
}): Promise<WalletPassData | null> {
  // Mismo resultado que getActiveProgram (service.ts), sin importarlo: service.ts importa wallet-sync.
  const base = await prisma.loyaltyProgram.findFirst({ where: { id: member.programId, organizationId: member.organizationId } });
  if (!base) return null;
  const rule = await prisma.loyaltyProgramVersion.findUnique({ where: { programId_version: { programId: base.id, version: base.currentVersion } } });
  if (!rule) return null;
  const program = { ...base, rule };
  const cardUrl = appUrl(memberCardPath(member.organization.slug, member.publicToken));
  const style = cardStyle(program);
  const updatedAt = new Date(Math.max(member.updatedAt.getTime(), program.updatedAt.getTime()));
  return {
    memberId: member.id,
    programId: program.id,
    businessName: member.organization.name,
    logoUrl: member.organization.logoUrl,
    programName: program.name,
    rewardName: program.rule.rewardName,
    cycleVisits: member.cycleVisits,
    visitGoal: program.rule.visitGoal,
    availableRewards: member._count.rewards,
    memberSince: member.createdAt,
    cardUrl,
    style,
    updatedAt,
    card: buildWalletCard({
      businessName: member.organization.name,
      programName: program.name,
      memberFirstName: firstName(member.name),
      cycleVisits: member.cycleVisits,
      visitGoal: program.rule.visitGoal,
      rewardName: program.rule.rewardName,
      availableRewards: member._count.rewards,
      cardUrl,
    }),
  };
}

/** Por la tarjeta pública (negocio + token del QR). */
export async function getWalletPassDataByToken(orgSlug: string, token: string): Promise<WalletPassData | null> {
  const member = await prisma.loyaltyMember.findFirst({
    where: { publicToken: token, organization: { slug: orgSlug } },
    select: MEMBER_SELECT,
  });
  return member ? toPassData(member) : null;
}

/** Por el id del miembro (lo que usan las actualizaciones). */
export async function getWalletPassDataById(memberId: string): Promise<WalletPassData | null> {
  const member = await prisma.loyaltyMember.findUnique({ where: { id: memberId }, select: MEMBER_SELECT });
  return member ? toPassData(member) : null;
}

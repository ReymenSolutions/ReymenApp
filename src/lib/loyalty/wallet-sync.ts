// Mantiene al día los pases de Wallet cuando cambia el progreso de un miembro
// (visita, recompensa, canje, cancelación). Nunca lanza: Wallet es un reflejo
// de la tarjeta, si falla la tarjeta web sigue siendo la fuente de verdad.

import { prisma } from "@/lib/prisma";
import type { StoredDomainEvent } from "@/lib/domain-events";
import { appleWalletConfig, pushAppleUpdates } from "./wallet-apple";
import { googleWalletConfig, updateGoogleObject } from "./wallet-google";
import { getWalletPassDataById } from "./wallet-data";

export async function refreshWalletPass(memberId: string): Promise<void> {
  const apple = appleWalletConfig();
  const google = googleWalletConfig();
  if (!apple && !google) return;
  try {
    if (apple) {
      const devices = await prisma.loyaltyWalletDevice.findMany({ where: { memberId, passTypeId: apple.passTypeId }, select: { id: true, pushToken: true } });
      if (devices.length) {
        // Apple pregunta "qué cambió desde..." por la fecha del miembro; un canje no toca al miembro, así que se marca aquí.
        await prisma.loyaltyMember.update({ where: { id: memberId }, data: { updatedAt: new Date() } });
        const gone = await pushAppleUpdates([...new Set(devices.map((d) => d.pushToken))], apple);
        if (gone.length) await prisma.loyaltyWalletDevice.deleteMany({ where: { memberId, pushToken: { in: gone } } });
      }
    }
    if (google) {
      const data = await getWalletPassDataById(memberId);
      if (data) await updateGoogleObject(data, google);
    }
  } catch (err) {
    console.error("[wallet-sync] No se pudo actualizar el pase:", err instanceof Error ? err.message : err);
  }
}

/** Para llamar después de confirmar el cambio, sin hacer esperar a la caja. */
export function queueWalletRefresh(memberId: string): void {
  if (!appleWalletConfig() && !googleWalletConfig()) return;
  void refreshWalletPass(memberId);
}

const MEMBER_EVENTS = new Set(["loyalty.visit_earned", "loyalty.visit_reversed", "loyalty.reward_unlocked", "loyalty.reward_redeemed"]);

/**
 * Consumidor de la bandeja de eventos: cubre los cambios que no pasan por la
 * caja (ventas del POS, cancelaciones, ajustes). No lanza nunca para no
 * reintentar el evento ni repetir otras automatizaciones.
 */
export async function consumeWalletEvent(event: StoredDomainEvent): Promise<void> {
  if (event.subjectType !== "loyalty_member" || !MEMBER_EVENTS.has(event.type)) return;
  await refreshWalletPass(event.subjectId);
}

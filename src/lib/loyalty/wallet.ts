// Apple Wallet / Google Wallet para la tarjeta de lealtad.
//
// - buildWalletCard(): el contenido del pase (puro, probado).
// - getWalletAvailability(): cada proveedor se activa solo cuando sus
//   credenciales están en el servidor (ver wallet-apple.ts, wallet-google.ts
//   y docs/wallet.md). Sin ellas, los botones dicen "próximamente".
// - Rutas: /lealtad/<negocio>/tarjeta/<token>/wallet/{apple,google} entregan
//   el pase; /api/wallet/apple es el servicio web de actualizaciones de Apple;
//   wallet-sync.ts empuja los cambios de progreso a los dos.
//
// Regla: la fuente de verdad es la base de datos de Reymen. El pase solo
// refleja el estado; si el cliente lo borra o cambia de teléfono, su progreso
// sigue intacto y basta con volver a agregarlo.

import { progressOf } from "./cycle";
import { appleWalletConfig } from "./wallet-apple";
import { googleWalletConfig } from "./wallet-google";

export interface WalletAvailability {
  apple: boolean;
  google: boolean;
}

export function getWalletAvailability(): WalletAvailability {
  return { apple: appleWalletConfig() !== null, google: googleWalletConfig() !== null };
}

export interface WalletCardInput {
  businessName: string;
  programName: string;
  memberFirstName: string;
  cycleVisits: number;
  visitGoal: number;
  rewardName: string;
  availableRewards: number;
  /** URL pública de la tarjeta: es lo que codifica el QR del pase. */
  cardUrl: string;
}

export interface WalletCard {
  header: string;
  title: string;
  holder: string;
  progressLabel: string;
  message: string;
  barcode: { format: "QR"; message: string };
}

/** Contenido del pase (idioma: español, como la tarjeta web). Sin datos de contacto. */
export function buildWalletCard(input: WalletCardInput): WalletCard {
  const p = progressOf(input.cycleVisits, input.visitGoal);
  const message =
    input.availableRewards > 0
      ? `¡Tienes ${input.rewardName.toLowerCase()} lista para canjear!`
      : p.remaining === 1
        ? `Te falta 1 visita para ${input.rewardName.toLowerCase()}`
        : `Te faltan ${p.remaining} visitas para ${input.rewardName.toLowerCase()}`;
  return {
    header: input.businessName,
    title: input.programName,
    holder: input.memberFirstName,
    progressLabel: `${p.current} de ${p.goal} visitas`,
    message,
    barcode: { format: "QR", message: input.cardUrl },
  };
}

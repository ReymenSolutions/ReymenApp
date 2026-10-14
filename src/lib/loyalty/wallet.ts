// Apple Wallet / Google Wallet para la tarjeta de lealtad.
//
// Estado en esta branch (demo): NO hay credenciales en el proyecto, así que
// ninguna de las dos integraciones está conectada. Lo que sí existe:
//   - buildWalletCard(): el contenido exacto que llevaría el pase (pura, probada).
//   - getWalletAvailability(): mantiene Wallet desactivado mientras no exista la implementación.
//   - Las rutas /lealtad/<negocio>/tarjeta/<token>/wallet/{apple,google}
//     responden 501: falta implementar firma y actualización de pases, además de credenciales.
//
// Regla: la fuente de verdad es la base de datos de Reymen. El pase solo
// refleja el estado; si el cliente lo borra o cambia de teléfono, su progreso
// sigue intacto y basta con volver a agregarlo.
//
// Para conectar (siguiente fase):
//   Apple  → APPLE_WALLET_PASS_TYPE_ID, APPLE_WALLET_TEAM_ID,
//            APPLE_WALLET_CERT_P12_BASE64, APPLE_WALLET_CERT_PASSWORD
//            (firma .pkpass + web service de actualizaciones).
//   Google → GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT_JSON
//            (clase loyaltyClass + objetos loyaltyObject + JWT "Save to Google Wallet").

import { progressOf } from "./cycle";

export interface WalletAvailability {
  apple: boolean;
  google: boolean;
}

// Credentials alone do not implement pass signing or the update service.
// Keep both providers disabled until those integrations exist and are tested.
export function getWalletAvailability(): WalletAvailability {
  return { apple: false, google: false };
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

import { loyaltyRewardUnlocked } from "./loyalty-reward-unlocked";
import type { Blueprint } from "../types";
import { welcomeNewCustomer } from "./welcome-new-customer";
import { inventoryLowAlert } from "./inventory-low-alert";
import { dailyExecutiveReport } from "./daily-executive-report";
import { secondVisit } from "./second-visit";
import { customerRecovery } from "./customer-recovery";
import { postVisitFeedback } from "./post-visit-feedback";
import { birthdayCampaign } from "./birthday-campaign";
import { vipCustomerAlert } from "./vip-customer-alert";

// El catálogo: cada blueprint es código versionado con sus pruebas, no filas en la base.
// Una v2 se agrega junto a la v1 (que sigue mientras haya instancias que la usen).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL: Blueprint<any>[] = [loyaltyRewardUnlocked, welcomeNewCustomer, inventoryLowAlert, dailyExecutiveReport, secondVisit, customerRecovery, postVisitFeedback, birthdayCampaign, vipCustomerAlert];

export function listBlueprints(): Blueprint[] {
  return ALL;
}

export function getBlueprint(key: string, version?: number | null): Blueprint | null {
  const list = ALL.filter((b) => b.key === key);
  if (version != null) return list.find((b) => b.version === version) ?? null;
  return list.filter((b) => b.status === "active").sort((a, b) => b.version - a.version)[0] ?? null;
}

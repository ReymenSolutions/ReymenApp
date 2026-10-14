import { welcomeNewCustomer } from "./welcome-new-customer";

/** Uses the same contact policy, simulation and dispatcher as other campaigns. */
export const loyaltyRewardUnlocked: typeof welcomeNewCustomer = {
  ...welcomeNewCustomer,
  key: "loyalty_reward_unlocked",
  defaultConfig: { ...welcomeNewCustomer.defaultConfig, cooldownDays: 1 },
  name: "Recompensa de lealtad disponible",
  description: "Avisa de una recompensa ganada, solo a clientes con consentimiento de contacto. Activación explícita y simulación disponibles.",
  trigger: "loyalty.reward_unlocked",
  requiredModules: ["LOYALTY", "AUTOMATIONS"],
  overlapCategories: ["loyalty"],
  decide: (event, ctx) => {
    if (!ctx.customer) return { kind: "skip", reason: "no_customer" };
    const payload = event.payload as { rewardName?: string } | null;
    if (!payload?.rewardName) return { kind: "skip", reason: "invalid_reward" };
    return { kind: "act", action: { type: "message", channel: "whatsapp", templateKey: "loyalty_reward_unlocked_v1",
      variables: { name: ctx.customer.name ?? "", businessName: ctx.organization.name, rewardName: payload.rewardName } } };
  },
};

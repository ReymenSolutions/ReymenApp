"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { redeemLoyaltyReward } from "@/actions/loyalty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { useStationBranch } from "./useStationBranch";

export function RedeemRewardButton({
  rewardId,
  rewardName,
  branches,
  fixedBranch,
  onRedeemed,
  size = "sm",
}: {
  rewardId: string;
  rewardName: string;
  branches: { id: string; name: string }[];
  fixedBranch?: string | null;
  onRedeemed?: () => void;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const { branch } = useStationBranch(branches, fixedBranch);
  const [loading, setLoading] = useState(false);

  async function redeem() {
    if (!window.confirm(L.redeemConfirm(rewardName))) return;
    setLoading(true);
    try {
      await redeemLoyaltyReward({ rewardId, branch });
      toast.success(L.redeemedToast(rewardName));
      onRedeemed?.();
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, lang === "es" ? "No se pudo canjear" : "Couldn't redeem"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" size={size} onClick={redeem} loading={loading} className="bg-emerald-600 hover:bg-emerald-700">
      <Gift className="h-4 w-4" aria-hidden="true" />
      {loading ? L.redeeming : L.redeem}
    </Button>
  );
}

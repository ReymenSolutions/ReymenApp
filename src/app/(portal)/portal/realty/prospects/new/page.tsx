import { redirect } from "next/navigation";
import { getRealtyContext } from "@/lib/realty/context";
import { listAdvisors, listZones } from "@/lib/realty/queries";
import { ProspectForm } from "@/components/realty/ProspectForm";

export default async function NewProspectPage() {
  const ctx = await getRealtyContext();
  if (!ctx.canOperate) redirect("/portal/realty/prospects");
  const [zones, advisors] = await Promise.all([listZones(ctx.orgId), listAdvisors(ctx.orgId)]);
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-bold text-[#031738] dark:text-white">{ctx.R.newProspect}</h2>
      <ProspectForm
        zones={zones}
        advisors={advisors}
        branches={ctx.branches}
        initial={{
          leadId: null,
          leadLabel: null,
          name: "",
          phone: "",
          email: "",
          operation: "SALE",
          propertyType: "",
          minBudget: "",
          maxBudget: "",
          currency: ctx.currency,
          minBedrooms: "",
          minBathrooms: "",
          minArea: "",
          moveTimeline: "",
          financingNeeded: "",
          preferences: [],
          zoneIds: [],
          branchId: "",
          advisorUserId: ctx.userId,
          active: true,
          source: "",
        }}
      />
    </div>
  );
}

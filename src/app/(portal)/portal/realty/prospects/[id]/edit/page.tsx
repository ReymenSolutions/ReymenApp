import { notFound, redirect } from "next/navigation";
import { getRealtyContext } from "@/lib/realty/context";
import { getProspect, listAdvisors, listZones } from "@/lib/realty/queries";
import { ProspectForm } from "@/components/realty/ProspectForm";

const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export default async function EditProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRealtyContext();
  if (!ctx.canOperate) redirect("/portal/realty/prospects");
  const { id } = await params;
  const [p, zones, advisors] = await Promise.all([getProspect(ctx.orgId, id), listZones(ctx.orgId), listAdvisors(ctx.orgId)]);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-bold text-[#031738] dark:text-white">{ctx.R.edit}: {p.lead?.name ?? ctx.R.prospect}</h2>
      <ProspectForm
        zones={zones}
        advisors={advisors}
        branches={ctx.branches}
        initial={{
          id: p.id,
          leadId: p.leadId,
          leadLabel: p.lead ? [p.lead.name, p.lead.phone].filter(Boolean).join(" · ") : null,
          name: "",
          phone: "",
          email: "",
          operation: p.operation,
          propertyType: p.propertyType ?? "",
          minBudget: s(p.minBudget),
          maxBudget: s(p.maxBudget),
          currency: p.currency,
          minBedrooms: s(p.minBedrooms),
          minBathrooms: s(p.minBathrooms),
          minArea: s(p.minArea),
          moveTimeline: p.moveTimeline ?? "",
          financingNeeded: p.financingNeeded === null ? "" : p.financingNeeded ? "yes" : "no",
          preferences: p.preferences,
          zoneIds: p.zones.map((z) => z.zoneId),
          branchId: p.branchId ?? "",
          advisorUserId: p.advisorUserId ?? "",
          active: p.active,
          source: p.source ?? "",
        }}
      />
    </div>
  );
}

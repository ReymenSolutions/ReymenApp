import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRealtyContext } from "@/lib/realty/context";
import { listAdvisors, listZones } from "@/lib/realty/queries";
import { ProspectForm } from "@/components/realty/ProspectForm";

export default async function NewProspectPage({ searchParams }: { searchParams: Promise<{ leadId?: string }> }) {
  const ctx = await getRealtyContext();
  if (!ctx.canOperate) redirect("/portal/realty/prospects");
  // Desde la ficha del contacto en el CRM: el prospecto nace ligado a esa persona (solo si es de esta organización).
  const { leadId } = await searchParams;
  const lead = leadId ? await prisma.lead.findFirst({ where: { id: leadId, organizationId: ctx.orgId, deletedAt: null }, select: { id: true, name: true, phone: true } }) : null;
  const [zones, advisors] = await Promise.all([listZones(ctx.orgId), listAdvisors(ctx.orgId)]);
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-bold text-[#031738] dark:text-white">{ctx.R.newProspect}</h2>
      <ProspectForm
        zones={zones}
        advisors={advisors}
        branches={ctx.branches}
        initial={{
          leadId: lead?.id ?? null,
          leadLabel: lead ? [lead.name, lead.phone].filter(Boolean).join(" · ") : null,
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

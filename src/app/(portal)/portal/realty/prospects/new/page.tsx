import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRealtyContext } from "@/lib/realty/context";
import { listAdvisors, listZones } from "@/lib/realty/queries";
import { matchZones } from "@/lib/realty/profile-suggestion";
import { ProspectForm } from "@/components/realty/ProspectForm";

export default async function NewProspectPage({ searchParams }: { searchParams: Promise<{ leadId?: string; suggestion?: string }> }) {
  const ctx = await getRealtyContext();
  if (!ctx.canOperate) redirect("/portal/realty/prospects");
  // Desde la ficha del contacto en el CRM: el prospecto nace ligado a esa persona (solo si es de esta organización).
  const { leadId, suggestion: suggestionId } = await searchParams;
  const lead = leadId ? await prisma.lead.findFirst({ where: { id: leadId, organizationId: ctx.orgId, deletedAt: null }, select: { id: true, name: true, phone: true } }) : null;
  const [zones, advisors] = await Promise.all([listZones(ctx.orgId), listAdvisors(ctx.orgId)]);
  // «Editar» una propuesta de la IA: el formulario abre prellenado con lo que dedujo (solo si es de este contacto).
  const suggestion = lead && suggestionId ? await prisma.realtyProfileSuggestion.findFirst({ where: { id: suggestionId, organizationId: ctx.orgId, leadId: lead.id, status: "PENDING" } }) : null;
  const suggested = suggestion ? matchZones(suggestion.zoneNames, zones).zoneIds : [];
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
          operation: suggestion?.operation ?? "SALE",
          propertyType: suggestion?.propertyType ?? "",
          minBudget: suggestion?.minBudget ? String(Number(suggestion.minBudget)) : "",
          maxBudget: suggestion ? String(Number(suggestion.maxBudget)) : "",
          currency: ctx.currency,
          minBedrooms: suggestion?.minBedrooms ? String(suggestion.minBedrooms) : "",
          minBathrooms: "",
          minArea: "",
          moveTimeline: suggestion?.moveTimeline ?? "",
          financingNeeded: "",
          preferences: suggestion?.preferences ?? [],
          zoneIds: suggested,
          branchId: "",
          advisorUserId: ctx.userId,
          active: true,
          source: suggestion ? "ai:conversation" : "",
        }}
      />
    </div>
  );
}

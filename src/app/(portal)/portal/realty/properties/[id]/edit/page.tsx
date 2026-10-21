import { notFound, redirect } from "next/navigation";
import { getRealtyContext } from "@/lib/realty/context";
import { getProperty, listAdvisors, listZones } from "@/lib/realty/queries";
import { PropertyForm } from "@/components/realty/PropertyForm";

const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRealtyContext();
  if (!ctx.canOperate) redirect("/portal/realty/properties");
  const { id } = await params;
  const [p, zones, advisors] = await Promise.all([getProperty(ctx.orgId, id), listZones(ctx.orgId), listAdvisors(ctx.orgId)]);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-4 text-lg font-bold text-[#031738] dark:text-white">{ctx.R.edit}: {p.title}</h2>
      <PropertyForm
        zones={zones}
        advisors={advisors}
        branches={ctx.branches}
        canManage={ctx.canManage}
        initial={{
          id: p.id,
          title: p.title,
          description: p.description ?? "",
          operation: p.operation,
          propertyType: p.propertyType,
          status: p.status,
          price: String(p.price),
          currency: p.currency,
          zoneId: p.zoneId,
          postalCode: p.postalCode ?? "",
          neighborhood: p.neighborhood ?? "",
          municipality: p.municipality ?? "",
          state: p.state ?? "",
          addressLine: p.addressLine ?? "",
          showExactLocation: p.showExactLocation,
          latitude: s(p.latitude),
          longitude: s(p.longitude),
          bedrooms: s(p.bedrooms),
          bathrooms: s(p.bathrooms),
          parkingSpaces: s(p.parkingSpaces),
          constructionArea: s(p.constructionArea),
          landArea: s(p.landArea),
          ageYears: s(p.ageYears),
          furnished: !!p.furnished,
          features: p.features,
          contactWhatsapp: p.contactWhatsapp ?? "",
          branchId: p.branchId ?? "",
          advisorUserId: p.advisorUserId ?? "",
          published: !!p.publishedAt,
        }}
      />
    </div>
  );
}

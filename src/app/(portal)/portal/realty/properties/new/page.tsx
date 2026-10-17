import { redirect } from "next/navigation";
import { getRealtyContext } from "@/lib/realty/context";
import { listAdvisors, listZones } from "@/lib/realty/queries";
import { PropertyForm } from "@/components/realty/PropertyForm";
import { Empty } from "@/components/realty/RealtyBits";
import Link from "next/link";

export default async function NewPropertyPage() {
  const ctx = await getRealtyContext();
  if (!ctx.canOperate) redirect("/portal/realty/properties");
  const [zones, advisors] = await Promise.all([listZones(ctx.orgId), listAdvisors(ctx.orgId)]);
  if (zones.length === 0)
    return (
      <Empty>
        {ctx.R.zonesSubtitle}{" "}
        {ctx.canManage && <Link className="font-semibold text-[#063C82] underline" href="/portal/realty/settings">{ctx.R.addZone}</Link>}
      </Empty>
    );
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-4 text-lg font-bold text-[#031738] dark:text-white">{ctx.R.newProperty}</h2>
      <PropertyForm
        zones={zones}
        advisors={advisors}
        branches={ctx.branches}
        initial={{
          title: "",
          description: "",
          operation: "SALE",
          propertyType: "HOUSE",
          status: "AVAILABLE",
          price: "",
          currency: ctx.currency,
          zoneId: "",
          neighborhood: "",
          addressLine: "",
          showExactLocation: false,
          latitude: "",
          longitude: "",
          bedrooms: "",
          bathrooms: "",
          parkingSpaces: "",
          constructionArea: "",
          landArea: "",
          ageYears: "",
          furnished: false,
          features: [],
          contactWhatsapp: "",
          branchId: "",
          advisorUserId: ctx.userId,
          published: true,
        }}
      />
    </div>
  );
}

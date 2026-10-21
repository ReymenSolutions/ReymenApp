import { redirect } from "next/navigation";
import { getRealtyContext } from "@/lib/realty/context";
import { listAdvisors, listZones } from "@/lib/realty/queries";
import { PropertyForm } from "@/components/realty/PropertyForm";
import { SectionCard } from "@/components/realty/RealtyBits";
import { ZoneRow } from "@/components/realty/ManageForms";

export default async function NewPropertyPage() {
  const ctx = await getRealtyContext();
  if (!ctx.canOperate) redirect("/portal/realty/properties");
  const [zones, advisors] = await Promise.all([listZones(ctx.orgId), listAdvisors(ctx.orgId)]);
  // Sin zonas no se puede dar de alta una propiedad (cada una pertenece a una zona):
  // quien administra la agrega aquí mismo; al guardarla, la página muestra el formulario.
  if (zones.length === 0)
    return (
      <div className="mx-auto max-w-3xl">
        <SectionCard title={ctx.R.needZoneTitle} subtitle={ctx.canManage ? ctx.R.needZoneDesc : undefined}>
          {ctx.canManage ? <ZoneRow zone={{ name: "", latitude: null, longitude: null }} /> : <p className="text-sm text-slate-600">{ctx.R.needZoneAskManager}</p>}
        </SectionCard>
      </div>
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
          zoneId: zones.length === 1 ? zones[0].id : "",
          postalCode: "",
          neighborhood: "",
          municipality: "",
          state: "",
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

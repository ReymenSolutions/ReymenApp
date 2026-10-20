import { redirect } from "next/navigation";
import { getRealtyContext } from "@/lib/realty/context";
import { listZones } from "@/lib/realty/queries";
import { SectionCard } from "@/components/realty/RealtyBits";
import { SettingsForm, ZoneRow } from "@/components/realty/ManageForms";
import { RecomputeButton } from "@/components/realty/PropertyTools";

export default async function RealtySettingsPage() {
  const ctx = await getRealtyContext();
  if (!ctx.canManage) redirect("/portal/realty");
  const { R } = ctx;
  const zones = await listZones(ctx.orgId);
  return (
    <div className="space-y-6">
      <SectionCard title={R.generalTitle}>
        <SettingsForm publicWhatsapp={ctx.settings?.publicWhatsapp ?? ""} defaultCurrency={ctx.currency} />
      </SectionCard>
      <SectionCard title={R.zonesTitle} subtitle={R.zonesSubtitle}>
        <div className="space-y-4">
          {zones.map((z) => (
            <ZoneRow key={z.id} zone={{ id: z.id, name: z.name, postalCode: z.postalCode, latitude: z.latitude, longitude: z.longitude, usage: R.zoneInUse(z._count.properties, z._count.leadZones) }} />
          ))}
          <div className="border-t border-slate-100 pt-4">
            <ZoneRow zone={{ name: "", latitude: null, longitude: null }} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title={R.matchesTitle} subtitle={R.matchesSubtitle}>
        <RecomputeButton />
      </SectionCard>
    </div>
  );
}

import { getRealtyContext } from "@/lib/realty/context";
import { RealtyHeader } from "@/components/realty/RealtyHeader";
import { RealtyTabs } from "@/components/realty/RealtyTabs";
import { RealtyMobileNav } from "@/components/realty/RealtyMobileNav";

// REYMEN Ops Realty: módulo propio (REALTY) con su entrada en el menú y sus
// pestañas. Es una capa sobre el CRM: no tiene inbox, pipeline ni tareas.
export default async function RealtyLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getRealtyContext();
  return (
    <div className="pb-20 lg:pb-0">
      <RealtyHeader R={ctx.R} orgName={ctx.org.name} isDemo={ctx.isDemo} canOperate={ctx.canOperate} />
      <RealtyTabs canManage={ctx.canManage} />
      {children}
      <RealtyMobileNav canManage={ctx.canManage} />
    </div>
  );
}

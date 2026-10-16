import { LoyaltyProgramBrowser } from "@/components/loyalty/LoyaltyProgramBrowser";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { LoyaltyHeader } from "@/components/loyalty/LoyaltyHeader";
import { LoyaltyTabs } from "@/components/loyalty/LoyaltyTabs";

// Lealtad es un módulo propio (LOYALTY): una entrada en el menú lateral y sus
// seis pantallas (Resumen, Programa, Clientes, Visitas, Mapa y Analytics) en
// la barra de pestañas bajo el encabezado.
export default async function LoyaltyLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getLoyaltyContext();
  const { L, program } = ctx;
  return (
    <div>
      <LoyaltyHeader
        L={L}
        orgName={ctx.org.name}
        programName={null}
        isDemo={program?.isDemo ?? false}
        paused={program?.status === "PAUSED"}
        showRegister={!!program && ctx.canOperate}
      />
      <LoyaltyTabs />
      {ctx.canOperate && <LoyaltyProgramBrowser programs={ctx.programs} selectedId={program?.id ?? ""} lang={ctx.lang} />}
      {children}
    </div>
  );
}

import { PauseCircle } from "lucide-react";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { LoyaltyHeader } from "@/components/loyalty/LoyaltyHeader";

// Lealtad es un módulo propio (LOYALTY). Sus seis pantallas (Resumen,
// Programa, Clientes, Visitas, Mapa y Analytics) están en el menú lateral.
export default async function LoyaltyLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getLoyaltyContext();
  const { L, program } = ctx;
  return (
    <div>
      <LoyaltyHeader
        L={L}
        orgName={ctx.org.name}
        programName={program?.name ?? null}
        isDemo={program?.isDemo ?? false}
        showRegister={!!program && ctx.canOperate}
      />
      {program?.status === "PAUSED" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {L.pausedBanner}
        </div>
      )}
      {children}
    </div>
  );
}

import Image from "next/image";
import { notFound } from "next/navigation";
import { getWolfLandingOrg, WOLF_LOGO } from "@/lib/workshop/landing";
import { WolfInquiryForm } from "@/components/workshop/WolfInquiryForm";
import { prisma } from "@/lib/prisma";
import { PROVISIONAL_WORKSHOP_SERVICES } from "@/lib/workshop/services";

export const dynamic = "force-dynamic";

export default async function TallerWolfPage() {
  const org = await getWolfLandingOrg();
  if (!org) notFound();
  const catalog = await prisma.workshopService.findMany({ where: { organizationId: org.id }, select: { nameEs: true, nameEn: true, active: true, provisional: true }, orderBy: { nameEs: "asc" } });
  const services = catalog.length ? catalog.filter((service) => service.active).map((service) => [service.nameEs, service.nameEn]) : PROVISIONAL_WORKSHOP_SERVICES;
  const provisional = !catalog.length || catalog.some((service) => service.active && service.provisional);
  return <main className="min-h-screen bg-[#090909] text-white">
    <div className="mx-auto max-w-6xl px-[clamp(1rem,4vw,3rem)] pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 py-5">
        <span className="text-sm font-bold tracking-[0.28em]">TALLER WOLF</span>
        <nav className="flex gap-4 text-sm text-white/75"><a href="#servicios" className="hover:text-white">Servicios / Services</a><a href="#cotizar" className="hover:text-white">Cotizar / Quote</a></nav>
      </header>
      <section className="grid items-center gap-8 py-10 sm:py-16 md:grid-cols-2">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Servicio Automotriz · Monterrey, N.L.</p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">MECÁNICA QUE TE RESPALDA</h1>
          <p className="mt-5 text-base leading-relaxed text-white/70">Solicita una cotización para tu vehículo. El taller revisa la falla y te presenta el trabajo para tu autorización. / Request a quote for your vehicle. The workshop reviews the issue and presents the work for your approval.</p>
          <div className="mt-7 flex flex-wrap gap-3"><a href="#cotizar" className="rounded-md bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-500">Pedir cotización / Request a quote</a><a href="https://wa.me/528711079931" className="rounded-md border border-white/35 px-5 py-3 text-sm font-bold hover:bg-white/10">WhatsApp</a></div>
        </div>
        <div className="mx-auto w-full max-w-md rounded-2xl border border-white/15 bg-black p-5"><Image src={WOLF_LOGO} alt="Logotipo limpio de Taller Wolf" width={720} height={720} priority className="h-auto w-full object-contain" /></div>
      </section>
      <section id="servicios" className="border-t border-white/15 py-10">
        <h2 className="text-2xl font-bold">Servicios / Services</h2>
        <p className="mt-2 text-sm text-white/60">{provisional ? "Lista general provisional; el alcance y precio se confirman en cada cotización. / General provisional list; scope and price are confirmed in each quote." : "El alcance y precio se confirman en cada cotización. / Scope and price are confirmed in each quote."}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{services.map(([es, en]) => <li key={es} className="rounded-xl border border-white/15 bg-white/5 p-4"><span className="font-semibold">{es}</span><span className="mt-1 block text-sm text-white/55">{en}</span></li>)}</ul>
      </section>
      <section className="grid gap-6 border-t border-white/15 py-10 md:grid-cols-2">
        <div><h2 className="text-2xl font-bold">Cómo trabajamos / How it works</h2><ol className="mt-5 space-y-3 text-sm text-white/75"><li>1. Solicita una cotización con los datos de tu vehículo. / Send your vehicle details.</li><li>2. Revisamos y diagnosticamos la falla. / We inspect and diagnose the issue.</li><li>3. Apruebas la cotización antes del trabajo. / You approve the quote before work starts.</li><li>4. Entregamos el vehículo con la garantía aplicable. / We return your vehicle with the applicable warranty.</li></ol></div>
        <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-sm leading-relaxed text-white/75"><h2 className="text-lg font-bold text-white">Garantía / Warranty</h2><p className="mt-3">90 días o 5,000 km en mano de obra, lo que ocurra primero. Las refacciones tienen la garantía de su fabricante. Todo trabajo adicional requiere autorización previa. / 90 days or 5,000 km on labor, whichever comes first. Parts carry their manufacturer warranty. Additional work requires prior approval.</p></div>
      </section>
      <section id="cotizar" className="grid gap-8 border-t border-white/15 py-10 md:grid-cols-2"><div><h2 className="text-2xl font-bold">Pide tu cotización / Request a quote</h2><p className="mt-3 text-sm text-white/70">Comparte la información de tu vehículo y la falla. El taller se comunicará contigo sobre esta solicitud. / Share your vehicle details and the issue. The workshop will contact you about this request.</p><div className="mt-8 space-y-2 text-sm text-white/75"><p>Burocratas 515, Colonia Burócratas del Estado, Monterrey, N.L.</p><p>WhatsApp: <a className="underline" href="tel:+528711079931">871 107 9931</a></p><p>Lunes a viernes 9:00–19:00 · Sábado 9:00–15:00</p><p className="text-white/55">Monday–Friday 9:00–19:00 · Saturday 9:00–15:00</p></div></div><WolfInquiryForm /></section>
      <footer className="border-t border-white/15 pt-6 text-xs text-white/45">Taller Wolf · Sistema operado con Reymen</footer>
    </div>
  </main>;
}

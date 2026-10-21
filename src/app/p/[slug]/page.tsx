import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bath, BedDouble, Car, MapPin, Ruler } from "lucide-react";
import { getPublicProperty } from "@/lib/realty/public";
import { getServerLang } from "@/lib/i18n-server";
import { pickDict } from "@/lib/i18n-dict";
import { enumLabel, realtyStrings } from "@/lib/i18n-realty";
import { appUrl } from "@/lib/app-url";
import { num } from "@/lib/loyalty/format";
import { priceText } from "@/lib/realty/page-helpers";
import { PublicCtas, ViewTracker } from "@/components/realty/PublicLanding";

// Landing pública de una propiedad: /p/<slug>[?src=smartcard|qr|meta…].
// Sin sesión (ver src/proxy.ts). Nunca muestra la dirección exacta salvo que
// el negocio lo active, ni datos internos (asesor, prospectos, notas).

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicProperty(slug);
  if (!p) return { title: "REYMEN Ops", robots: { index: false } };
  const desc = `${p.zone.name}${p.neighborhood ? ` · ${p.neighborhood}` : ""} · ${priceText(p.price, p.currency)}`;
  return {
    title: `${p.title} · ${p.organization.name}`,
    description: desc,
    openGraph: { title: p.title, description: desc, images: p.media[0] ? [{ url: appUrl(`/api/realty/media/${p.media[0].id}`) }] : [] },
  };
}

export default async function PublicPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, lang] = await Promise.all([params, getServerLang()]);
  const p = await getPublicProperty(slug);
  if (!p) notFound();
  const R = pickDict(realtyStrings, lang);
  const url = appUrl(`/p/${p.slug}`);
  const closed = p.status === "SOLD" || p.status === "RENTED";
  const specs = [
    p.bedrooms !== null && { icon: BedDouble, label: `${p.bedrooms} ${R.bedrooms.toLowerCase()}` },
    p.bathrooms !== null && { icon: Bath, label: `${p.bathrooms} ${R.bathrooms.toLowerCase()}` },
    p.parkingSpaces !== null && { icon: Car, label: `${p.parkingSpaces} ${R.parking.toLowerCase()}` },
    p.constructionArea && { icon: Ruler, label: `${num(p.constructionArea)} m²` },
    !p.constructionArea && p.landArea && { icon: Ruler, label: `${num(p.landArea)} m²` },
  ].filter(Boolean) as { icon: typeof Ruler; label: string }[];

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      {!closed && <ViewTracker slug={p.slug} />}
      <header className="bg-[#031738] px-4 py-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {p.organization.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.organization.logoUrl} alt="" className="h-8 w-8 rounded-md bg-white object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#063C82] text-xs font-bold">{p.organization.name.slice(0, 2).toUpperCase()}</span>
          )}
          <span className="truncate text-sm font-semibold">{p.organization.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl pb-10">
        {p.media.length > 0 ? (
          <div className="flex snap-x snap-mandatory overflow-x-auto bg-[#080C13]" aria-label={R.photos}>
            {p.media.map((m, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={`/api/realty/media/${m.id}`} alt={m.altText ?? `${p.title} ${i + 1}`} width={m.width} height={m.height} loading={i === 0 ? "eager" : "lazy"} className="aspect-[3/2] w-full shrink-0 snap-center object-cover sm:w-[85%]" />
            ))}
          </div>
        ) : (
          <div className="flex aspect-[3/2] items-center justify-center bg-[#EDECEB] text-sm text-slate-500">{R.pubNoPhotos}</div>
        )}

        <div className="space-y-4 px-4 pt-4">
          {closed && <p className="rounded-xl bg-slate-800 p-3 text-center text-sm font-semibold text-white">{R.pubSoldBanner}</p>}
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#063C82]">{enumLabel(R, "type", p.propertyType)} · {enumLabel(R, "op", p.operation)}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-[#080C13]">{p.title}</h1>
            <p className="mt-2 text-3xl font-extrabold text-[#031738]">
              {priceText(p.price, p.currency)}
              {p.operation === "RENT" && <span className="text-base font-medium text-slate-500"> /{lang === "es" ? "mes" : "mo"}</span>}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-4 w-4 text-[#063C82]" aria-hidden="true" />
              {p.location.exact && p.location.address ? [p.location.address, p.neighborhood, p.municipality].filter(Boolean).join(", ") : [p.neighborhood, p.zone.name !== p.neighborhood ? p.zone.name : null, p.municipality].filter(Boolean).join(", ")}
              {!p.location.exact && <span className="text-xs text-slate-400">· {R.pubApproxLocation}</span>}
            </p>
            {specs.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {specs.map((s) => (
                  <li key={s.label} className="flex items-center gap-2 rounded-lg bg-[#F2F4F6] px-3 py-2 text-sm text-slate-800">
                    <s.icon className="h-4 w-4 text-[#063C82]" aria-hidden="true" />
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!closed && (
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              {p.agentName && (
                <p className="mb-3 text-sm text-slate-600">
                  {R.advisedBy}: <strong className="text-[#080C13]">{p.agentName}</strong>
                </p>
              )}
              <PublicCtas
                slug={p.slug}
                whatsapp={p.whatsapp}
                title={p.title}
                labels={{ whatsapp: R.pubContactWhatsapp, schedule: R.pubSchedule, share: R.pubShare, whatsappMsg: R.pubWhatsappMsg(p.title, url), scheduleMsg: R.pubScheduleMsg(p.title, url), noContact: R.pubNoContact, copied: R.copied }}
              />
            </section>
          )}

          {(p.description || p.features.length > 0) && (
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              {p.description && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{p.description}</p>}
              {p.features.length > 0 && (
                <>
                  <h2 className="mb-2 mt-4 text-sm font-semibold text-[#080C13]">{R.pubFeatures}</h2>
                  <ul className="flex flex-wrap gap-1.5">
                    {p.features.map((f) => (
                      <li key={f} className="rounded-full bg-[#EDECEB] px-3 py-1 text-xs font-medium text-slate-800">{enumLabel(R, "feat", f)}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          <p className="text-center text-xs text-slate-400">{R.pubPoweredBy}</p>
        </div>
      </main>
    </div>
  );
}

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
import { PROPERTY_TYPES } from "@/lib/realty/constants";
import { getOrgTimezone, localDateString } from "@/lib/business-day";
import { MAX_DAYS_AHEAD } from "@/lib/realty/visit-request";
import { Gallery, LandingPrefs, ViewTracker } from "@/components/realty/PublicLanding";
import { ActionPanel } from "@/components/realty/PublicForms";

// Landing pública de una propiedad: /p/<slug>[?src=smartcard|qr|meta…]. Sin sesión (ver src/proxy.ts). Nunca muestra la
// dirección exacta salvo que el negocio lo active, ni datos internos (asesor, prospectos, notas). Colores con tokens
// `--rl-*` (globals.css) para que se lea igual en modo claro y oscuro.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicProperty(slug);
  if (!p) return { title: "Reymen Real Estate", robots: { index: false } };
  const desc = `${p.zone.name}${p.neighborhood ? ` · ${p.neighborhood}` : ""} · ${priceText(p.price, p.currency)}`;
  return {
    title: `${p.title} · ${p.organization.name}`,
    description: desc,
    openGraph: { title: p.title, description: desc, images: p.media[0] ? [{ url: appUrl(`/api/realty/media/${p.media[0].id}`) }] : [] },
  };
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const CARD = "rounded-2xl border border-[var(--rl-line)] bg-[var(--rl-surface)] shadow-[var(--rl-shadow)]";

export default async function PublicPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, lang] = await Promise.all([params, getServerLang()]);
  const p = await getPublicProperty(slug);
  if (!p) notFound();
  const R = pickDict(realtyStrings, lang);
  const url = appUrl(`/p/${p.slug}`);
  const closed = p.status === "SOLD" || p.status === "RENTED";
  const tz = await getOrgTimezone(p.organizationId);
  const today = localDateString(new Date(), tz);
  const specs = [
    p.bedrooms !== null && { icon: BedDouble, value: String(p.bedrooms), label: R.bedrooms },
    p.bathrooms !== null && { icon: Bath, value: String(p.bathrooms), label: R.bathrooms },
    p.parkingSpaces !== null && { icon: Car, value: String(p.parkingSpaces), label: R.parking },
    p.constructionArea && { icon: Ruler, value: String(num(p.constructionArea)), label: R.constructionArea },
    !p.constructionArea && p.landArea && { icon: Ruler, value: String(num(p.landArea)), label: R.landArea },
  ].filter(Boolean) as { icon: typeof Ruler; value: string; label: string }[];
  const place = p.location.exact && p.location.address ? [p.location.address, p.neighborhood, p.municipality].filter(Boolean).join(", ") : [p.neighborhood, p.zone.name !== p.neighborhood ? p.zone.name : null, p.municipality].filter(Boolean).join(", ");
  const errors = {
    phone_invalid: R.pubInqErrPhone,
    postal_not_found: R.pubInqErrPostalNotFound,
    postal_ambiguous: R.pubInqErrPostalAmbiguous,
    place_invalid: R.pubInqErrPlace,
    unavailable: R.pubInqErrUnavailable,
    rate_limited: R.pubInqErrRate,
    generic: R.pubInqErrGeneric,
    slot_unavailable: R.lpErrSlot,
    date_invalid: R.lpErrDate,
  };

  return (
    <div className="rl min-h-screen pb-24 lg:pb-10">
      {!closed && <ViewTracker slug={p.slug} />}
      <header className="bg-gradient-to-r from-[#031738] to-[#063C82] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {p.organization.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.organization.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-xs font-bold">{p.organization.name.slice(0, 2).toUpperCase()}</span>
            )}
            <span className="truncate text-sm font-semibold sm:text-base">{p.organization.name}</span>
          </div>
          <LandingPrefs labels={{ lang: R.lpLang, toDark: R.lpThemeToDark, toLight: R.lpThemeToLight }} />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 pt-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 lg:pt-6">
        {/* Foto, título, precio y datos clave */}
        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
          {p.media.length > 0 ? (
            <Gallery images={p.media.map((m, i) => ({ id: m.id, width: m.width, height: m.height, alt: m.altText ?? `${p.title} ${i + 1}` }))} labels={{ photoOf: R.lpPhotoOf, prev: R.lpPrev, next: R.lpNext }} />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-[var(--rl-surface-2)] text-sm text-[var(--rl-muted)] sm:aspect-[16/10]">{R.pubNoPhotos}</div>
          )}

          {closed && <p className="rounded-xl bg-[#031738] p-3 text-center text-sm font-semibold text-white">{R.pubSoldBanner}</p>}

          <section className={`${CARD} p-5`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--rl-brand)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--rl-brand-ink)]">{enumLabel(R, "op", p.operation)}</span>
              <span className="rounded-full bg-[var(--rl-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--rl-ink)]">{enumLabel(R, "type", p.propertyType)}</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight text-[var(--rl-ink)] sm:text-3xl">{p.title}</h1>
            <p className="mt-2 text-3xl font-extrabold text-[var(--rl-brand)] sm:text-4xl">
              {priceText(p.price, p.currency)}
              {p.operation === "RENT" && <span className="text-base font-medium text-[var(--rl-muted)]"> /{lang === "es" ? "mes" : "mo"}</span>}
            </p>
            <p className="mt-3 flex items-start gap-1.5 text-sm text-[var(--rl-muted)]">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rl-brand)]" aria-hidden="true" />
              <span>
                {place}
                {!p.location.exact && <span className="opacity-80"> · {R.pubApproxLocation}</span>}
              </span>
            </p>
            {specs.length > 0 && (
              <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {specs.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 rounded-xl bg-[var(--rl-surface-2)] px-3 py-2.5">
                    <s.icon className="h-5 w-5 shrink-0 text-[var(--rl-brand)]" aria-hidden="true" />
                    <span className="leading-tight">
                      <strong className="block text-base text-[var(--rl-ink)]">{s.value}</strong>
                      <span className="text-xs text-[var(--rl-muted)]">{s.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Acciones: en pantallas grandes queda fija a la derecha; en el celular va justo después de los datos */}
        {!closed && (
          <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="lg:sticky lg:top-4">
              <ActionPanel
                slug={p.slug}
                title={p.title}
                whatsapp={p.whatsapp}
                agentName={p.agentName}
                labels={{ tabs: R.lpTabs, tabVisit: R.lpTabVisit, tabInfo: R.lpTabInfo, advisor: R.lpAdvisor, whatsapp: R.pubContactWhatsapp, whatsappMsg: R.pubWhatsappMsg(p.title, url), share: R.pubShare, copied: R.copied, noContact: R.pubNoContact, or: R.lpOr }}
                visit={{
                  locale: lang === "es" ? "es-MX" : "en-US",
                  minDate: today,
                  maxDate: addDays(today, MAX_DAYS_AHEAD),
                  labels: {
                    intro: R.lpVisitIntro,
                    name: R.pubInqName,
                    phone: R.pubInqPhone,
                    date: R.lpVisitDate,
                    pickDay: R.lpVisitPickDay,
                    loading: R.lpVisitLoading,
                    noSlots: R.lpVisitNoSlots,
                    times: R.lpVisitTimes,
                    notes: R.lpVisitNotes,
                    consent: R.pubInqConsent(p.organization.name),
                    submit: R.lpVisitSubmit,
                    sending: R.pubInqSending,
                    doneTitle: R.lpVisitDoneTitle,
                    doneBodyTemplate: R.lpVisitDoneBody("{when}"),
                    doneNote: R.lpVisitDoneNote,
                    whatsapp: R.pubInqWhatsapp,
                    whatsappMsgTemplate: R.lpVisitWhatsappMsg(p.title, url, p.slug, "{when}"),
                    placeholders: { name: R.lpPhName, phone: R.lpPhPhone, notes: R.lpVisitNotesPh },
                    errors,
                  },
                }}
                inquiry={{
                  initial: { operation: p.operation, propertyType: p.propertyType },
                  typeOptions: PROPERTY_TYPES.map((t) => ({ value: t, label: enumLabel(R, "type", t) })),
                  labels: {
                    title: R.pubInqTitle,
                    intro: R.pubInqIntro,
                    name: R.pubInqName,
                    phone: R.pubInqPhone,
                    operation: R.pubInqOperation,
                    buy: R.pubInqBuy,
                    rent: R.pubInqRent,
                    type: R.pubInqType,
                    budgetSale: R.pubInqBudgetSale,
                    budgetRent: R.pubInqBudgetRent,
                    place: R.pubInqPlace,
                    consent: R.pubInqConsent(p.organization.name),
                    submit: R.pubInqSubmit,
                    sending: R.pubInqSending,
                    doneTitle: R.pubInqDoneTitle,
                    doneBody: R.pubInqDoneBody,
                    doneNotSaved: R.pubInqDoneNotSaved,
                    whatsapp: R.pubInqWhatsapp,
                    whatsappMsg: R.pubInqWhatsappMsg(p.title, url, p.slug),
                    placeholders: { name: R.lpPhName, phone: R.lpPhPhone, budgetSale: R.lpPhBudgetSale, budgetRent: R.lpPhBudgetRent, place: R.lpPhPlace },
                    errors,
                  },
                }}
              />
            </div>
          </aside>
        )}

        {/* Descripción y características */}
        {(p.description || p.features.length > 0) && (
          <div className="space-y-4 lg:col-start-1 lg:row-start-2">
            <section className={`${CARD} p-5`}>
              {p.description && (
                <>
                  <h2 className="mb-2 text-base font-bold text-[var(--rl-ink)]">{R.lpDescription}</h2>
                  <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-[var(--rl-ink)]">{p.description}</p>
                </>
              )}
              {p.features.length > 0 && (
                <>
                  <h2 className={`mb-2 text-base font-bold text-[var(--rl-ink)] ${p.description ? "mt-5" : ""}`}>{R.pubFeatures}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {p.features.map((f) => (
                      <li key={f} className="rounded-full bg-[var(--rl-surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--rl-ink)]">{enumLabel(R, "feat", f)}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        )}

        <p className="pt-2 text-center text-xs text-[var(--rl-muted)] lg:col-span-2">
          {R.lpFolio}: {p.slug} · {R.pubPoweredBy}
        </p>
      </main>
    </div>
  );
}

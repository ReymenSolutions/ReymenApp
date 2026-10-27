"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getSmartcardProfileForEdit,
  updateSmartcardProfile,
  updateSmartcardProfileTheme,
  saveProfileLink,
  deleteProfileLink,
  type SmartcardProfileInput,
} from "@/actions/portal/smartcard";
import type { SmartcardProfile, ProfileLink, ProfileThemeInfo } from "@/lib/smartcard-company";
import { parseThemeConfig, passesWcagAA, resolveCardTokens } from "@/lib/smartcard-theme";
import { LINK_ICON_OPTIONS } from "@/lib/smartcard-link-icons";
import type { ProfileProduct } from "@/lib/smartcard-products";
import { TabBar } from "@/components/shared/TabBar";
import { SmartcardProductsSection } from "./SmartcardProductsSection";
import { SmartcardCardPreview } from "./SmartcardCardPreview";

/**
 * Self-service editor for a SmartCard PROFILE (2026-09-29) — the rich
 * digital-card page (photo, bio, contact, social, custom links), matching
 * admin.reymen.mx's own profile-edit form field for field, minus what stays
 * REYMEN-only: slug (the profile's vanity URL), status/is_noindex (can take
 * it offline), and theme (catalog not wired up here). See
 * updateSmartcardProfile's own comment in the action file for the full
 * reasoning — keep this list in sync with that one.
 */

const EMPTY_INPUT: SmartcardProfileInput = {
  displayName: "",
  firstName: "",
  lastName: "",
  jobTitle: "",
  company: "",
  bio: "",
  photoUrl: "",
  logoUrl: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  address: "",
  mapsUrl: "",
  instagram: "",
  facebook: "",
  linkedin: "",
  tiktok: "",
  youtube: "",
  primaryColor: "",
  accentColor: "",
  backgroundColor: "",
};


function toInput(p: SmartcardProfile): SmartcardProfileInput {
  return {
    displayName: p.displayName ?? "",
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    jobTitle: p.jobTitle ?? "",
    company: p.company ?? "",
    bio: p.bio ?? "",
    photoUrl: p.photoUrl ?? "",
    logoUrl: p.logoUrl ?? "",
    phone: p.phone ?? "",
    whatsapp: p.whatsapp ?? "",
    email: p.email ?? "",
    website: p.website ?? "",
    address: p.address ?? "",
    mapsUrl: p.mapsUrl ?? "",
    instagram: p.instagram ?? "",
    facebook: p.facebook ?? "",
    linkedin: p.linkedin ?? "",
    tiktok: p.tiktok ?? "",
    youtube: p.youtube ?? "",
    primaryColor: p.primaryColor ?? "",
    accentColor: p.accentColor ?? "",
    backgroundColor: p.backgroundColor ?? "",
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// Valor de la última opción del selector de diseño (no es un id de tema).
const CUSTOM_DESIGN = "__custom__";

const HEX_COLOR_INPUT = /^#[0-9a-fA-F]{6}$/;

/** Selector de color + campo de texto hex, sincronizados — el <input
 * type="color"> del navegador siempre necesita un #RRGGBB válido (no
 * acepta vacío ni parcial), así que se le pasa un fallback mientras el
 * campo de texto se deja escribir libremente (se valida solo al guardar,
 * igual que el resto del formulario). */
function ColorField({
  id,
  label,
  value,
  onChange,
  fallback,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallback: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={HEX_COLOR_INPUT.test(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export function SmartcardProfileDialog({
  profileId,
  onOpenChange,
  lang,
  liveCardUrl = null,
}: {
  profileId: string | null;
  onOpenChange: (open: boolean) => void;
  lang: "es" | "en";
  /** Enlace a la tarjeta publicada (sin contar escaneo), si la tarjeta tiene código. */
  liveCardUrl?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SmartcardProfileInput>(EMPTY_INPUT);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);
  const [newLinkIcon, setNewLinkIcon] = useState("");
  const [tab, setTab] = useState<"perfil" | "apariencia" | "contacto" | "links" | "productos">("perfil");
  // false para un asesor editando su propia tarjeta: diseño y logo los fija la empresa.
  const [canEditDesign, setCanEditDesign] = useState(true);
  const [products, setProducts] = useState<ProfileProduct[]>([]);
  const [theme, setTheme] = useState<ProfileThemeInfo | null>(null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [savedThemeId, setSavedThemeId] = useState<string | null>(null);
  // Última opción de «Diseño de la tarjeta»: tus propios colores y fondo sobre el diseño base. Con cualquier otro
  // diseño se usa tal cual (al guardar se borran los colores propios).
  const [isCustom, setIsCustom] = useState(false);

  const t = (es: string, en: string) => (lang === "es" ? es : en);

  // El tema elegido define los colores base; los del perfil (si hay) van encima.
  const selectedTheme = theme?.options.find((o) => o.id === themeId) ?? null;
  const themeBase = parseThemeConfig(selectedTheme?.config);
  const tokens = isCustom
    ? resolveCardTokens(selectedTheme?.config, form.primaryColor, form.accentColor, form.backgroundColor)
    : resolveCardTokens(selectedTheme?.config);

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    setForm(EMPTY_INPUT);
    setLinks([]);
    setProducts([]);
    setTheme(null);
    setTab("perfil");
    (async () => {
      const result = await getSmartcardProfileForEdit(profileId);
      if (!result.success) {
        toast.error(result.error);
        onOpenChange(false);
        return;
      }
      setForm(toInput(result.profile));
      setIsCustom(Boolean(result.profile.primaryColor || result.profile.accentColor || result.profile.backgroundColor));
      setLinks(result.links);
      setTheme(result.theme);
      setCanEditDesign(result.canEditDesign);
      setThemeId(result.theme?.currentId ?? null);
      setSavedThemeId(result.theme?.currentId ?? null);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  function set<K extends keyof SmartcardProfileInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!profileId) return;
    setSaving(true);
    // Con un diseño predefinido se limpian los colores/fondo propios para que se vea tal cual.
    const payload = isCustom ? form : { ...form, primaryColor: "", accentColor: "", backgroundColor: "" };
    const result = await updateSmartcardProfile(profileId, payload);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    if (canEditDesign && themeId && themeId !== savedThemeId) {
      const themeResult = await updateSmartcardProfileTheme(profileId, themeId);
      if (!themeResult.success) {
        toast.error(themeResult.error);
        return;
      }
    }
    toast.success(t("Perfil actualizado.", "Profile updated."));
    onOpenChange(false);
  }

  async function handleAddLink() {
    if (!profileId) return;
    setAddingLink(true);
    const result = await saveProfileLink(profileId, { title: newLinkTitle, url: newLinkUrl, icon: newLinkIcon || null });
    setAddingLink(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setLinks((prev) => [...prev, { id: result.linkId, title: newLinkTitle.trim(), url: newLinkUrl.trim(), icon: newLinkIcon || null, sortOrder: prev.length }]);
    setNewLinkTitle("");
    setNewLinkUrl("");
    setNewLinkIcon("");
  }

  async function handleDeleteLink(linkId: string) {
    if (!profileId) return;
    setBusyLinkId(linkId);
    const result = await deleteProfileLink(linkId, profileId);
    setBusyLinkId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  return (
    <Dialog open={profileId !== null} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Editar perfil", "Edit profile")}</DialogTitle>
          <DialogDescription>
            {t(
              "Esto es lo que ve la gente cuando escanea esta tarjeta.",
              "This is what people see when they scan this card."
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <TabBar
              tabs={[
                { key: "perfil", label: t("Perfil", "Profile") },
                ...(canEditDesign ? [{ key: "apariencia", label: t("Apariencia", "Appearance") }] : []),
                { key: "contacto", label: t("Contacto y redes", "Contact & social") },
                { key: "links", label: "Links", count: links.length },
                { key: "productos", label: t("Productos", "Products"), count: products.length },
              ]}
              value={tab}
              onChange={(k) => setTab(k as typeof tab)}
              label={t("Secciones del perfil", "Profile sections")}
              idBase="spd"
            />
            <div role="tabpanel" id="spd-panel-perfil" aria-labelledby="spd-tab-perfil" hidden={tab !== "perfil"} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  id="profile-display-name"
                  label={t("Nombre a mostrar *", "Display name *")}
                  value={form.displayName}
                  onChange={(v) => set("displayName", v)}
                />
              </div>
              <Field id="profile-first-name" label={t("Nombre(s)", "First name")} value={form.firstName ?? ""} onChange={(v) => set("firstName", v)} />
              <Field id="profile-last-name" label={t("Apellido(s)", "Last name")} value={form.lastName ?? ""} onChange={(v) => set("lastName", v)} />
              <Field id="profile-job-title" label={t("Puesto", "Job title")} value={form.jobTitle ?? ""} onChange={(v) => set("jobTitle", v)} />
              <Field id="profile-company" label={t("Empresa", "Company")} value={form.company ?? ""} onChange={(v) => set("company", v)} />
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="profile-bio">Bio</Label>
                <Textarea id="profile-bio" value={form.bio ?? ""} onChange={(e) => set("bio", e.target.value)} rows={2} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="profile-photo-url" label={t("URL de foto", "Photo URL")} value={form.photoUrl ?? ""} onChange={(v) => set("photoUrl", v)} placeholder="https://..." />
              {canEditDesign && (
                <Field id="profile-logo-url" label={t("URL de logo", "Logo URL")} value={form.logoUrl ?? ""} onChange={(v) => set("logoUrl", v)} placeholder="https://..." />
              )}
            </div>
            <p className="-mt-4 text-xs text-slate-500">
              {t(
                "Por ahora solo se acepta pegar la URL de una imagen ya alojada en otro lugar — subir un archivo directo llega más adelante.",
                "For now only pasting a URL to an already-hosted image is supported — direct file upload is coming later."
              )}
            </p>

            </div>

            <div role="tabpanel" id="spd-panel-apariencia" aria-labelledby="spd-tab-apariencia" hidden={tab !== "apariencia"} className="flex flex-col gap-6">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Diseño de la tarjeta", "Card design")}
              </h3>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-theme">{t("Diseño", "Design")}</Label>
                <select
                  id="profile-theme"
                  value={isCustom ? CUSTOM_DESIGN : (themeId ?? "")}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_DESIGN) {
                      setIsCustom(true);
                    } else {
                      setIsCustom(false);
                      setThemeId(e.target.value || null);
                    }
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  {themeId === null && !isCustom && <option value="">{t("Sin diseño", "No design")}</option>}
                  {(theme?.options ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  <option value={CUSTOM_DESIGN}>{t("Personalizado", "Custom")}</option>
                </select>
                <p className="text-xs text-slate-500">
                  {isCustom
                    ? t(
                        `Tus propios colores y fondo, sobre el diseño base «${selectedTheme?.name ?? "—"}». Si dejas un color en blanco se usa el del diseño.`,
                        `Your own colors and background, on top of the “${selectedTheme?.name ?? "—"}” base design. Leave a color blank to use the design's.`
                      )
                    : t(
                        "El diseño se usa tal cual, con sus colores y su fondo. Elige «Personalizado» para poner los tuyos; no se pierden al cambiar de diseño.",
                        "The design is used as is, with its own colors and background. Pick “Custom” to set yours; they aren't lost when you switch designs."
                      )}
                </p>
              </div>

              {isCustom && (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField
                      id="profile-primary-color"
                      label={t("Color primario", "Primary color")}
                      value={form.primaryColor ?? ""}
                      onChange={(v) => set("primaryColor", v)}
                      fallback={themeBase.primaryColor}
                    />
                    <ColorField
                      id="profile-accent-color"
                      label={t("Color de acento", "Accent color")}
                      value={form.accentColor ?? ""}
                      onChange={(v) => set("accentColor", v)}
                      fallback={themeBase.accentColor}
                    />
                  </div>
                  <div>
                    <ColorField
                      id="profile-background-color"
                      label={t("Color de fondo", "Background color")}
                      value={form.backgroundColor ?? ""}
                      onChange={(v) => set("backgroundColor", v)}
                      fallback={themeBase.darkBackground ? "#1A1D18" : "#FBF6EF"}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {t(
                        "Cualquier color: los textos se ajustan solos para leerse bien. En blanco se usa el fondo del diseño.",
                        "Any color: texts adjust automatically to stay readable. Blank uses the design's background."
                      )}
                    </p>
                  </div>
                  {HEX_COLOR_INPUT.test(form.accentColor ?? "") &&
                    !passesWcagAA(form.accentColor as string, tokens.background ?? (tokens.dark ? "#1A1D18" : "#FBF6EF"), true) && (
                      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {t(
                          "El color de acento se confunde con el fondo de la tarjeta; los botones y detalles podrían no distinguirse bien. Puedes guardar igual, pero conviene un color más fuerte (o cambiar el fondo).",
                          "The accent color blends into the card background, so buttons and details may be hard to see. You can still save, but a stronger color (or another background) is recommended."
                        )}
                      </p>
                    )}
                </div>
              )}
            </div>

            </div>

            <div role="tabpanel" id="spd-panel-contacto" aria-labelledby="spd-tab-contacto" hidden={tab !== "contacto"} className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="profile-phone" label={t("Teléfono", "Phone")} value={form.phone ?? ""} onChange={(v) => set("phone", v)} />
              <Field id="profile-whatsapp" label="WhatsApp" value={form.whatsapp ?? ""} onChange={(v) => set("whatsapp", v)} />
              <Field id="profile-email" label={t("Correo", "Email")} value={form.email ?? ""} onChange={(v) => set("email", v)} type="email" />
              <Field id="profile-website" label={t("Sitio web", "Website")} value={form.website ?? ""} onChange={(v) => set("website", v)} placeholder="https://..." />
              <div className="sm:col-span-2">
                <Field id="profile-address" label={t("Dirección", "Address")} value={form.address ?? ""} onChange={(v) => set("address", v)} />
              </div>
              <div className="sm:col-span-2">
                <Field id="profile-maps-url" label="URL de Google Maps" value={form.mapsUrl ?? ""} onChange={(v) => set("mapsUrl", v)} placeholder="https://..." />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="profile-instagram" label="Instagram" value={form.instagram ?? ""} onChange={(v) => set("instagram", v)} placeholder="https://..." />
              <Field id="profile-facebook" label="Facebook" value={form.facebook ?? ""} onChange={(v) => set("facebook", v)} placeholder="https://..." />
              <Field id="profile-linkedin" label="LinkedIn" value={form.linkedin ?? ""} onChange={(v) => set("linkedin", v)} placeholder="https://..." />
              <Field id="profile-tiktok" label="TikTok" value={form.tiktok ?? ""} onChange={(v) => set("tiktok", v)} placeholder="https://..." />
              <Field id="profile-youtube" label="YouTube" value={form.youtube ?? ""} onChange={(v) => set("youtube", v)} placeholder="https://..." />
            </div>

            </div>

            <div role="tabpanel" id="spd-panel-links" aria-labelledby="spd-tab-links" hidden={tab !== "links"}>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t(`Links del perfil público (${links.length})`, `Public profile links (${links.length})`)}
              </h3>
              <div className="flex flex-col gap-2">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-700">{l.title}</div>
                      <div className="truncate text-xs text-slate-500">
                        {l.url}
                        {l.icon && ` · ${LINK_ICON_OPTIONS.find((o) => o.value === l.icon)?.label ?? l.icon}`}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-red-500 hover:text-red-700"
                      disabled={busyLinkId === l.id}
                      onClick={() => handleDeleteLink(l.id)}
                    >
                      {busyLinkId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
                {links.length === 0 && (
                  <p className="text-sm text-slate-400">{t("Todavía no hay links.", "No links yet.")}</p>
                )}
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder={t("Título (ej. Menú)", "Title (e.g. Menu)")}
                  className="sm:flex-1"
                />
                <Input
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="sm:flex-1"
                />
                <select
                  value={newLinkIcon}
                  onChange={(e) => setNewLinkIcon(e.target.value)}
                  aria-label={t("Ícono del link", "Link icon")}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm sm:w-44"
                >
                  {LINK_ICON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value === "" ? t("Ícono genérico", "Generic icon") : o.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={addingLink || !newLinkTitle.trim() || !newLinkUrl.trim()}
                  onClick={handleAddLink}
                >
                  {addingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {t("Agregar link", "Add link")}
                </Button>
              </div>
            </div>

            </div>

            <div role="tabpanel" id="spd-panel-productos" aria-labelledby="spd-tab-productos" hidden={tab !== "productos"}>
              {profileId && <SmartcardProductsSection profileId={profileId} lang={lang} onProductsChange={setProducts} />}
            </div>
          </div>

          <aside className="lg:sticky lg:top-0 lg:self-start">
            <SmartcardCardPreview
              lang={lang}
              data={{
                displayName: form.displayName,
                jobTitle: form.jobTitle ?? "",
                company: form.company ?? "",
                bio: form.bio ?? "",
                photoUrl: form.photoUrl ?? "",
                logoUrl: form.logoUrl ?? "",
                phone: form.phone ?? "",
                whatsapp: form.whatsapp ?? "",
                email: form.email ?? "",
                website: form.website ?? "",
                address: form.address ?? "",
                mapsUrl: form.mapsUrl ?? "",
                instagram: form.instagram ?? "",
                facebook: form.facebook ?? "",
                linkedin: form.linkedin ?? "",
                tiktok: form.tiktok ?? "",
                youtube: form.youtube ?? "",
              }}
              tokens={tokens}
              links={links}
              products={products}
            />
            {liveCardUrl && (
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <a href={liveCardUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("Ver tarjeta real", "View live card")}
                </a>
              </Button>
            )}
          </aside>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("Cancelar", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !form.displayName.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("Guardar", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

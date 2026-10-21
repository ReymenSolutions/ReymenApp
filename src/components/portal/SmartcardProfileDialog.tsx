"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
  saveProfileLink,
  deleteProfileLink,
  type SmartcardProfileInput,
} from "@/actions/portal/smartcard";
import type { SmartcardProfile, ProfileLink } from "@/lib/smartcard-company";
import { passesWcagAA } from "@/lib/smartcard-theme";
import { SmartcardProductsSection } from "./SmartcardProductsSection";

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
};

// Default del formulario cuando el perfil no trae theme_overrides todavía
// — mismos valores base que reymen-smartcard siembra para un theme nuevo
// (packages/lib/src/theme-tokens.ts), así el picker no abre en negro puro.
const DEFAULT_PRIMARY_COLOR = "#111111";
const DEFAULT_ACCENT_COLOR = "#4F46E5";

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
}: {
  profileId: string | null;
  onOpenChange: (open: boolean) => void;
  lang: "es" | "en";
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SmartcardProfileInput>(EMPTY_INPUT);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const t = (es: string, en: string) => (lang === "es" ? es : en);

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    setForm(EMPTY_INPUT);
    setLinks([]);
    (async () => {
      const result = await getSmartcardProfileForEdit(profileId);
      if (!result.success) {
        toast.error(result.error);
        onOpenChange(false);
        return;
      }
      setForm(toInput(result.profile));
      setLinks(result.links);
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
    const result = await updateSmartcardProfile(profileId, form);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(t("Perfil actualizado.", "Profile updated."));
    onOpenChange(false);
  }

  async function handleAddLink() {
    if (!profileId) return;
    setAddingLink(true);
    const result = await saveProfileLink(profileId, { title: newLinkTitle, url: newLinkUrl });
    setAddingLink(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setLinks((prev) => [...prev, { id: result.linkId, title: newLinkTitle.trim(), url: newLinkUrl.trim(), sortOrder: prev.length }]);
    setNewLinkTitle("");
    setNewLinkUrl("");
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
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
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
          <div className="flex flex-col gap-6">
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
              <Field id="profile-logo-url" label={t("URL de logo", "Logo URL")} value={form.logoUrl ?? ""} onChange={(v) => set("logoUrl", v)} placeholder="https://..." />
            </div>
            <p className="-mt-4 text-xs text-slate-500">
              {t(
                "Por ahora solo se acepta pegar la URL de una imagen ya alojada en otro lugar — subir un archivo directo llega más adelante.",
                "For now only pasting a URL to an already-hosted image is supported — direct file upload is coming later."
              )}
            </p>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("Tema", "Theme")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  id="profile-primary-color"
                  label={t("Color primario", "Primary color")}
                  value={form.primaryColor ?? ""}
                  onChange={(v) => set("primaryColor", v)}
                  fallback={DEFAULT_PRIMARY_COLOR}
                />
                <ColorField
                  id="profile-accent-color"
                  label={t("Color de acento", "Accent color")}
                  value={form.accentColor ?? ""}
                  onChange={(v) => set("accentColor", v)}
                  fallback={DEFAULT_ACCENT_COLOR}
                />
              </div>
              {HEX_COLOR_INPUT.test(form.primaryColor ?? "") &&
                HEX_COLOR_INPUT.test(form.accentColor ?? "") &&
                !passesWcagAA(form.primaryColor as string, form.accentColor as string) && (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {t(
                      "Estos dos colores tienen poco contraste entre sí — el texto podría costar trabajo leerlo. Puedes guardar igual, pero te recomendamos elegir colores más distintos.",
                      "These two colors have low contrast with each other — text may be hard to read. You can still save, but choosing more distinct colors is recommended."
                    )}
                  </p>
                )}
              <p className="mt-2 text-xs text-slate-500">
                {t(
                  "Déjalos en blanco para usar los colores del tema por default de tu empresa.",
                  "Leave them blank to use your company's default theme colors."
                )}
              </p>
            </div>

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

            {profileId && <SmartcardProductsSection profileId={profileId} lang={lang} />}

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t(`Links del perfil público (${links.length})`, `Public profile links (${links.length})`)}
              </h3>
              <div className="flex flex-col gap-2">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-700">{l.title}</div>
                      <div className="truncate text-xs text-slate-500">{l.url}</div>
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

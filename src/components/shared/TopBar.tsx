"use client";

import { PasswordInput } from "@/components/ui/password-input";
import { useState, useEffect, useRef, useTransition } from "react";
import {
  Bell, LogOut, MessageSquare, FileText, Sun, Moon, Globe,
  Image as ImageIcon, KeyRound, RefreshCw, User, Loader2, Upload, Users, X, Menu,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePreferences, type Theme, type Lang } from "@/context/preferences";
import { updateAvatar, changePassword, removeAvatar } from "@/actions/profile";
import { startImpersonation, stopImpersonation, getPortalUsers, refreshImpersonationImage, type PortalUser } from "@/actions/impersonation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readImageFileAsSquareDataUrl, squareImageErrorMessage } from "@/lib/square-image";
import { getErrorMessage } from "@/lib/user-error";

const AVATAR_PRESETS = [
  // Adventurer
  "https://api.dicebear.com/9.x/adventurer/svg?seed=alpha",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=beta",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=gamma",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=delta",
  // Lorelei
  "https://api.dicebear.com/9.x/lorelei/svg?seed=epsilon",
  "https://api.dicebear.com/9.x/lorelei/svg?seed=zeta",
  "https://api.dicebear.com/9.x/lorelei/svg?seed=eta",
  "https://api.dicebear.com/9.x/lorelei/svg?seed=theta",
  // Micah
  "https://api.dicebear.com/9.x/micah/svg?seed=iota",
  "https://api.dicebear.com/9.x/micah/svg?seed=kappa",
  "https://api.dicebear.com/9.x/micah/svg?seed=lambda",
  "https://api.dicebear.com/9.x/micah/svg?seed=mu",
  // Personas
  "https://api.dicebear.com/9.x/personas/svg?seed=nu",
  "https://api.dicebear.com/9.x/personas/svg?seed=xi",
  "https://api.dicebear.com/9.x/personas/svg?seed=omicron",
  "https://api.dicebear.com/9.x/personas/svg?seed=pi",
  // Fun Emoji
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=rho",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=sigma",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=tau",
  "https://api.dicebear.com/9.x/fun-emoji/svg?seed=upsilon",
  // Pixel Art
  "https://api.dicebear.com/9.x/pixel-art/svg?seed=phi",
  "https://api.dicebear.com/9.x/pixel-art/svg?seed=chi",
  "https://api.dicebear.com/9.x/pixel-art/svg?seed=psi",
  "https://api.dicebear.com/9.x/pixel-art/svg?seed=omega",
];

interface NotificationItem {
  type: string;
  label: string;
  detail: string;
  href: string;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return (email?.[0] ?? "U").toUpperCase();
}

interface TopBarProps {
  title?: string;
  /** Renders a hamburger button (visible only below `lg:`) that calls this
   * to open the off-canvas sidebar drawer. Omitted on pages that don't use
   * the sidebar shell (e.g. auth pages), where no button renders. */
  onMenuClick?: () => void;
}

type ActiveDialog = null | "avatar" | "password" | "switch-account" | "impersonate";

export function TopBar({ title, onMenuClick }: TopBarProps) {
  const { data: session, update } = useSession();
  const { theme, setTheme, lang, setLang, t } = usePreferences();

  const [notifications, setNotifications] = useState<{ count: number; items: NotificationItem[] }>({
    count: 0,
    items: [],
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifPos, setNotifPos] = useState<{ top: number; right: number } | null>(null);
  const [userMenuPos, setUserMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  // Avatar dialog state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [userImage, setUserImage] = useState<string | null>(session?.user?.image ?? null);
  const [isPendingAvatar, startAvatarTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password dialog state
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [isPendingPwd, startPwdTransition] = useTransition();

  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const notifDropRef = useRef<HTMLDivElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);
  const userDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.user?.image) setUserImage(session.user.image);
  }, [session?.user?.image]);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setNotifications(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (!notifBtnRef.current?.contains(target) && !notifDropRef.current?.contains(target)) {
        setNotifOpen(false);
      }
      if (!userBtnRef.current?.contains(target) && !userDropRef.current?.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleNotif() {
    if (notifOpen) { setNotifOpen(false); return; }
    if (notifBtnRef.current) {
      const r = notifBtnRef.current.getBoundingClientRect();
      setNotifPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setNotifOpen(true);
    setUserMenuOpen(false);
    // Opening the bell counts as having seen the current items — the list
    // keeps showing them (they're still pending), but the unread badge
    // clears until something genuinely new shows up.
    if (notifications.count > 0) {
      setNotifications((prev) => ({ ...prev, count: 0 }));
      fetch("/api/notifications", { method: "POST" }).catch(() => {});
    }
  }

  function toggleUserMenu() {
    if (userMenuOpen) { setUserMenuOpen(false); return; }
    if (userBtnRef.current) {
      const r = userBtnRef.current.getBoundingClientRect();
      setUserMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setUserMenuOpen(true);
    setNotifOpen(false);
  }

  function openDialog(dialog: ActiveDialog) {
    if (dialog === "avatar") {
      openAvatarDialog();
      return;
    }
    setUserMenuOpen(false);
    setActiveDialog(dialog);
    if (dialog === "password") {
      setPwdForm({ current: "", next: "", confirm: "" });
    }
  }

  function openAvatarDialog() {
    setAvatarPreview(userImage);
    setUserMenuOpen(false);
    setActiveDialog("avatar");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAvatarPreview(await readImageFileAsSquareDataUrl(file));
    } catch (error) {
      toast.error(squareImageErrorMessage(error, lang));
    }
  }

  function handleSaveAvatar() {
    if (!avatarPreview) return;
    startAvatarTransition(async () => {
      try {
        await updateAvatar(avatarPreview);
        setUserImage(avatarPreview);
        if (isImpersonating) {
          await refreshImpersonationImage(avatarPreview);
        } else {
          await update({ image: avatarPreview });
        }
        setActiveDialog(null);
        toast.success(lang === "es" ? "Avatar actualizado" : "Avatar updated");
      } catch (e) {
        toast.error(getErrorMessage(e, t.error));
      }
    });
  }

  function handleRemoveAvatar() {
    startAvatarTransition(async () => {
      try {
        await removeAvatar();
        setUserImage(null);
        setAvatarPreview(null);
        if (isImpersonating) {
          await refreshImpersonationImage(null);
        } else {
          await update({ image: null });
        }
        setActiveDialog(null);
        toast.success(lang === "es" ? "Avatar eliminado" : "Avatar removed");
      } catch (e) {
        toast.error(getErrorMessage(e, t.error));
      }
    });
  }

  function handleChangePassword() {
    if (pwdForm.next !== pwdForm.confirm) {
      toast.error(lang === "es" ? "Las contraseñas no coinciden" : "Passwords don't match");
      return;
    }
    if (pwdForm.next.length < 8) {
      toast.error(lang === "es" ? "Mínimo 8 caracteres" : "Minimum 8 characters");
      return;
    }
    startPwdTransition(async () => {
      try {
        await changePassword({ currentPassword: pwdForm.current, newPassword: pwdForm.next });
        setActiveDialog(null);
        setPwdForm({ current: "", next: "", confirm: "" });
        toast.success(lang === "es" ? "Contraseña actualizada. Vuelve a iniciar sesión." : "Password updated. Please sign in again.");
        // Las sesiones anteriores dejan de valer al cambiar la contraseña (también esta): se cierra y se vuelve a entrar.
        signOut({ callbackUrl: "/login" });
      } catch (e) {
        toast.error(getErrorMessage(e, t.error));
      }
    });
  }

  // Impersonation state
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [impersonateSearch, setImpersonateSearch] = useState("");
  const [impersonateLoadingId, setImpersonateLoadingId] = useState<string | null>(null);
  const [impersonateFetching, setImpersonateFetching] = useState(false);

  const isImpersonating = !!session?.user?.impersonating;
  const initials = getInitials(session?.user?.name, session?.user?.email);
  const userRole = session?.user?.role ?? "";
  const isAdminUser = !isImpersonating && (userRole === "SUPER_ADMIN" || userRole === "ADMIN");
  // Administrador de la plataforma que además pertenece a una organización (p. ej. super admin y dueño): salta entre ambas áreas.
  const pathname = usePathname();
  const inAdminArea = pathname?.startsWith("/admin");
  const canSwitchArea = isAdminUser && !!session?.user?.organizationId;

  const filteredPortalUsers = portalUsers.filter((u) => {
    const q = impersonateSearch.toLowerCase();
    return (
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.organizationName.toLowerCase().includes(q)
    );
  });

  async function openImpersonateDialog() {
    setUserMenuOpen(false);
    setImpersonateSearch("");
    setActiveDialog("impersonate");
    setImpersonateFetching(true);
    try {
      const users = await getPortalUsers();
      setPortalUsers(users);
    } catch {
      toast.error(t.impersonateError);
      setActiveDialog(null);
    } finally {
      setImpersonateFetching(false);
    }
  }

  async function handleStartImpersonation(userId: string) {
    setImpersonateLoadingId(userId);
    try {
      await startImpersonation(userId);
      window.location.href = "/portal/home";
    } catch (e) {
      toast.error(getErrorMessage(e, t.impersonateError));
      setImpersonateLoadingId(null);
    }
  }

  async function handleStopImpersonation() {
    setUserMenuOpen(false);
    try {
      await stopImpersonation();
      window.location.href = "/admin/home";
    } catch {
      toast.error(t.error);
    }
  }

  return (
    <>
      {/* ── Impersonation banner ─────────────────────────────────── */}
      {isImpersonating && session?.user?.impersonating && (
        <div className="flex shrink-0 items-center justify-between gap-3 bg-amber-400 px-4 py-1.5 text-sm font-medium text-amber-950 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-950 shrink-0" />
            <span>
              {t.impersonatingAs}: <strong>{session.user.name || session.user.email}</strong>
              <span className="ml-2 text-xs opacity-75">({session.user.role})</span>
            </span>
          </div>
          <button
            onClick={handleStopImpersonation}
            className="flex-shrink-0 rounded bg-amber-800 px-3 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-amber-900"
          >
            {t.stopImpersonation}
          </button>
        </div>
      )}

      <header className="relative flex h-16 shrink-0 items-center border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex flex-1 items-center gap-3">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 transition-colors lg:hidden"
              aria-label={t.menu}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          {title && <p className="text-sm text-slate-500">{title}</p>}
        </div>
        <Link
          href="/"
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 select-none hover:opacity-70 transition-opacity"
        >
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Reymen</span>
          <span className="h-3 w-px bg-slate-300" />
          <span className="text-xs font-medium text-brand-600 uppercase tracking-widest">Solutions</span>
        </Link>
        <div className="flex-1 flex items-center justify-end gap-2">
          {/* ── Notification bell ─────────────────────────────── */}
          <button
            ref={notifBtnRef}
            onClick={toggleNotif}
            className="relative rounded-md p-2 text-slate-500 hover:bg-slate-200 transition-colors focus:outline-none"
          >
            <Bell className="h-4 w-4" />
            {notifications.count > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {notifications.count > 9 ? "9+" : notifications.count}
              </span>
            )}
          </button>

          {notifOpen && notifPos && (
            <div
              ref={notifDropRef}
              style={{ position: "fixed", top: notifPos.top, right: notifPos.right, zIndex: 9999 }}
              className="w-72 rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">{t.notifications}</p>
              </div>
              {notifications.items.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-slate-400">{t.noNotifications}</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {notifications.items.map((item, i) => (
                    <Link
                      key={i}
                      href={item.href}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 p-1">
                        {item.type === "escalation" ? (
                          <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-brand-600" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700">{item.label}</p>
                        <p className="truncate text-xs text-slate-400">{item.detail}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── User menu trigger ──────────────────────────────── */}
          <button
            ref={userBtnRef}
            onClick={toggleUserMenu}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-200 transition-colors focus:outline-none"
          >
            {userImage ? (
              <img
                src={userImage}
                alt=""
                className="h-8 w-8 rounded-full object-cover ring-2 ring-brand-100"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 select-none">
                {initials}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium leading-none text-slate-900">
                {session?.user?.name ?? session?.user?.email}
              </p>
              <p className="mt-0.5 text-xs leading-none text-slate-500">{userRole}</p>
            </div>
          </button>

          {/* ── User dropdown ──────────────────────────────────── */}
          {userMenuOpen && userMenuPos && (
            <div
              ref={userDropRef}
              style={{ position: "fixed", top: userMenuPos.top, right: userMenuPos.right, zIndex: 9999 }}
              className="w-72 rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 bg-gradient-to-r from-brand-50 to-slate-50 px-4 py-3 border-b border-slate-100">
                {userImage ? (
                  <img src={userImage} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-white shadow" />
                ) : (
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white shadow">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{session?.user?.name ?? "—"}</p>
                  <p className="truncate text-xs text-slate-500">{session?.user?.email}</p>
                  <span className="mt-0.5 inline-block rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 uppercase tracking-wide">
                    {userRole}
                  </span>
                </div>
              </div>

              {/* Stop impersonation — shown only when impersonating */}
              {isImpersonating && session?.user?.impersonating && (
                <div className="border-b border-amber-200 bg-amber-50 py-1">
                  <button
                    onClick={handleStopImpersonation}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-amber-800 transition-colors hover:bg-amber-100"
                  >
                    <X className="h-4 w-4 shrink-0" />
                    <div className="text-left">
                      <p className="font-medium">{t.stopImpersonation}</p>
                      <p className="text-xs text-amber-600">
                        {t.backToAdmin}: {session.user.impersonating.adminName || session.user.impersonating.adminEmail}
                      </p>
                    </div>
                  </button>
                </div>
              )}

              {/* Profile actions */}
              <div className="py-1 border-b border-slate-100">
                <button
                  onClick={() => openDialog("avatar")}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <ImageIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  {t.changeAvatar}
                </button>
                <button
                  onClick={() => openDialog("password")}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <KeyRound className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  {t.changePassword}
                </button>
              </div>

              {/* Preferences */}
              <div className="px-4 py-3 border-b border-slate-100 space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t.preferences}</p>

                {/* Theme */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    {theme === "dark" ? <Moon className="h-3.5 w-3.5 text-slate-400" /> : <Sun className="h-3.5 w-3.5 text-slate-400" />}
                    {t.theme}
                  </span>
                  <div className="flex rounded-md border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setTheme("light" as Theme)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors",
                        theme === "light" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {t.light}
                    </button>
                    <button
                      onClick={() => setTheme("dark" as Theme)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors border-l border-slate-200",
                        theme === "dark" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {t.dark}
                    </button>
                  </div>
                </div>

                {/* Language */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    {t.language}
                  </span>
                  <div className="flex rounded-md border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setLang("es" as Lang)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors",
                        lang === "es" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      ES
                    </button>
                    <button
                      onClick={() => setLang("en" as Lang)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors border-l border-slate-200",
                        lang === "en" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      EN
                    </button>
                  </div>
                </div>
              </div>

              {/* Switch account + Impersonate (admin only) */}
              <div className="py-1 border-b border-slate-100">
                <button
                  onClick={() => openDialog("switch-account")}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  {t.switchAccount}
                </button>
                {canSwitchArea && (
                  <Link
                    href={inAdminArea ? "/portal/home" : "/admin/home"}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {inAdminArea ? (lang === "es" ? "Ir a mi portal" : "Go to my portal") : (lang === "es" ? "Ir a Administración" : "Go to Administration")}
                  </Link>
                )}
                {isAdminUser && (
                  <button
                    onClick={openImpersonateDialog}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Users className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    {t.impersonate}
                  </button>
                )}
              </div>

              {/* Sign out */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    signOut({ callbackUrl: "/login" });
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4 flex-shrink-0" />
                  {t.signOut}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>


      {/* ── Avatar Dialog ──────────────────────────────────────────── */}
      <Dialog open={activeDialog === "avatar"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-brand-600" />
              {t.changeAvatarTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Preview */}
            {avatarPreview && (
              <div className="flex justify-center">
                <img src={avatarPreview} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-brand-100" />
              </div>
            )}

            {/* Preset grid */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{lang === "es" ? "Avatares predefinidos" : "Preset avatars"}</p>
              <div className="max-h-64 overflow-y-auto pr-0.5">
                <div className="grid grid-cols-4 gap-2">
                  {AVATAR_PRESETS.map((url) => (
                    <button
                      key={url}
                      onClick={() => setAvatarPreview(url)}
                      className={cn(
                        "rounded-full overflow-hidden border-2 transition-all",
                        avatarPreview === url ? "border-brand-600 scale-105" : "border-transparent hover:border-brand-300"
                      )}
                    >
                      <img src={url} alt="" className="h-14 w-14 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* File upload */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{lang === "es" ? "O sube desde tu dispositivo" : "Or upload from your device"}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                {lang === "es" ? "Elegir imagen" : "Choose image"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>{t.cancel}</Button>
            {userImage && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleRemoveAvatar}
                disabled={isPendingAvatar}
              >
                {isPendingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : t.removeLogo}
              </Button>
            )}
            <Button onClick={handleSaveAvatar} disabled={isPendingAvatar || !avatarPreview}>
              {isPendingAvatar ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Password Dialog ─────────────────────────────────────────── */}
      <Dialog open={activeDialog === "password"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand-600" />
              {t.changePasswordTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pwd-current">{t.currentPassword}</Label>
              <PasswordInput
                id="pwd-current"
                value={pwdForm.current}
                onChange={(e) => setPwdForm((p) => ({ ...p, current: e.target.value }))}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-new">{t.newPassword}</Label>
              <PasswordInput
                id="pwd-new"
                value={pwdForm.next}
                onChange={(e) => setPwdForm((p) => ({ ...p, next: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-confirm">{t.confirmPassword}</Label>
              <PasswordInput
                id="pwd-confirm"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm((p) => ({ ...p, confirm: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>{t.cancel}</Button>
            <Button
              onClick={handleChangePassword}
              disabled={isPendingPwd || !pwdForm.current || !pwdForm.next || !pwdForm.confirm}
            >
              {isPendingPwd ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Impersonate Dialog ─────────────────────────────────────── */}
      <Dialog open={activeDialog === "impersonate"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-600" />
              {t.impersonateTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-slate-500">{t.impersonateDesc}</p>
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
              placeholder={t.impersonateSearch}
              value={impersonateSearch}
              onChange={(e) => setImpersonateSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto space-y-1 pr-0.5">
              {impersonateFetching ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : filteredPortalUsers.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">{t.noPortalUsers}</p>
              ) : (
                filteredPortalUsers.map((user) => (
                  <button
                    key={user.id}
                    disabled={!!impersonateLoadingId}
                    onClick={() => handleStartImpersonation(user.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-100 p-3 text-left transition-colors hover:border-brand-200 hover:bg-brand-50 disabled:opacity-50"
                  >
                    {user.image ? (
                      <img src={user.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                        {(user.name?.[0] ?? user.email[0]).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{user.name || "—"}</p>
                      <p className="truncate text-xs text-slate-500">{user.email} · {user.organizationName}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                        {user.role}
                      </span>
                      {impersonateLoadingId === user.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>{t.cancel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Switch Account Dialog ───────────────────────────────────── */}
      <Dialog open={activeDialog === "switch-account"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-brand-600" />
              {t.switchAccount}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.currentAccount}</p>
            <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
              {userImage ? (
                <img src={userImage} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {initials}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">{session?.user?.name}</p>
                <p className="text-xs text-slate-500">{session?.user?.email}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">{t.switchAccountInfo}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveDialog(null)}>{t.close}</Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => { setActiveDialog(null); signOut({ callbackUrl: "/login" }); }}
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              {t.signOut}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

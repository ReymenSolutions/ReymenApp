import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { SessionProvider } from "next-auth/react";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { PreferencesProvider } from "@/context/preferences";
import { isTestEnv } from "@/lib/app-env";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: process.env.REYMEN_ENV === "test" ? "PRUEBA · Reymen Solutions" : "Reymen Solutions",
  description: "Automatización inteligente para hacer crecer tu negocio.",
  // Nombre corto al agregarla a la pantalla de inicio del iPhone/iPad (ícono: app/apple-icon.png).
  appleWebApp: { title: "Reymen", capable: true, statusBarStyle: "default" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Use the validated server session: its preferences come from the User
  // row (cache invalidated by updatePreferences), rather than JWT claims
  // issued at login. Otherwise a hard reload restores an old theme/language.
  // Cookies remain the fallback for logged-out pages.
  const session = await auth().catch(() => null);
  const store = await cookies();

  const initialLang = session?.user
    ? (session.user.language === "en" ? "en" : "es")
    : (store.get("reymen-lang")?.value === "en" ? "en" : "es");
  const initialTheme = session?.user
    ? (session.user.theme === "dark" ? "dark" : "light")
    : (store.get("reymen-theme")?.value === "dark" ? "dark" : "light");

  return (
    <html lang={initialLang} className={initialTheme === "dark" ? "dark" : ""}>
      <body className={`${inter.className} antialiased bg-slate-50`}>
        <SessionProvider>
          <PreferencesProvider initialTheme={initialTheme} initialLang={initialLang}>
            {children}
            <Toaster position="top-right" richColors />
            {isTestEnv() && (
              <div role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] bg-amber-400 py-0.5 text-center text-xs font-bold uppercase tracking-wide text-amber-950">
                Ambiente de prueba · los cambios aquí no afectan a producción
              </div>
            )}
          </PreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

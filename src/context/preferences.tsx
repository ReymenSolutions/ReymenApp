"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { updatePreferences } from "@/actions/profile";
import { strings } from "@/lib/i18n";
import type { Lang, Strings } from "@/lib/i18n";

export type { Lang, Strings };
export type Theme = "light" | "dark";

interface PreferencesContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Strings;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  theme: "light",
  setTheme: () => {},
  lang: "es",
  setLang: () => {},
  t: strings.es,
});

export function usePreferences() {
  return useContext(PreferencesContext);
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  document.cookie = `reymen-theme=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function applyLang(lang: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  // Also set cookie so server components can read the language
  document.cookie = `reymen-lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

interface PreferencesProviderProps {
  children: ReactNode;
  initialTheme?: string | null;
  initialLang?: string | null;
}

export function PreferencesProvider({ children, initialTheme, initialLang }: PreferencesProviderProps) {
  const writes = useRef(Promise.resolve());
  // Initialize from server props only — validated session, or cookies when signed out.
  // Do NOT read localStorage here: the initializer runs on both server and client during
  // hydration, so any window/localStorage access would cause a hydration mismatch.
  const [theme, setThemeState] = useState<Theme>(initialTheme === "dark" ? "dark" : "light");
  const [lang, setLangState] = useState<Lang>(initialLang === "en" ? "en" : "es");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("reymen-theme", theme);
  }, [theme]);

  useEffect(() => {
    applyLang(lang);
    localStorage.setItem("reymen-lang", lang);
  }, [lang]);

  // Serialize rapid selections so an older save cannot restore an old theme.
  const persist = useCallback((data: { theme?: Theme; language?: Lang }) => {
    writes.current = writes.current.catch(() => {}).then(async () => {
      await updatePreferences(data);
    }).catch(() => {});
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persist({ theme: t });
  }, [persist]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    persist({ language: l });
  }, [persist]);

  const t = strings[lang];

  return (
    <PreferencesContext.Provider value={{ theme, setTheme, lang, setLang, t }}>
      {children}
    </PreferencesContext.Provider>
  );
}

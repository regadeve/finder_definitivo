"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { defaultLanguage, languageNames, messages, supportedLanguages, type AppLanguage } from "@/lib/i18n/messages";

const STORAGE_KEY = "103finder.language";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  languageNames: Record<AppLanguage, string>;
  supportedLanguages: readonly AppLanguage[];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

function isSupportedLanguage(value: string | null | undefined): value is AppLanguage {
  return value === "es" || value === "en";
}

export function AppLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    if (typeof window === "undefined") {
      return defaultLanguage;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : defaultLanguage;
  });

  useEffect(() => {
    let active = true;

    const supabase = createClient();
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || !active) return;

      const { data } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("id", session.user.id)
        .maybeSingle();

      const next = data?.preferred_language;
      if (active && isSupportedLanguage(next)) {
        setLanguageState(next);
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  };

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => interpolate(messages[language][key] ?? messages[defaultLanguage][key] ?? key, vars),
      languageNames,
      supportedLanguages,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useAppLanguage must be used inside AppLanguageProvider");
  }
  return context;
}

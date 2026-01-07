"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { Locale, translations, Translations, getTranslations } from "./i18n";

type I18nContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("th");

  const value: I18nContextType = {
    locale,
    setLocale,
    t: getTranslations(locale),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === "th" ? "en" : "th")}
      className="px-3 py-1 text-sm bg-[#1a1a2e] border border-[#d4af37]/30 rounded-lg text-gold hover:bg-[#2a2a4e] transition-colors"
    >
      {locale === "th" ? "🇹🇭 TH" : "🇺🇸 EN"}
    </button>
  );
}

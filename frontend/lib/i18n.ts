// i18n translations for Dark Odyssey
// Translations are loaded from JSON files in /locales

import thTranslations from '@/locales/th.json';
import enTranslations from '@/locales/en.json';

export type Locale = "th" | "en";

export const translations = {
    th: thTranslations,
    en: enTranslations,
} as const;

export type Translations = typeof translations.th;

export function getTranslations(locale: Locale): Translations {
    return translations[locale];
}

export const defaultLocale: Locale = "th";
export const locales: Locale[] = ["th", "en"];

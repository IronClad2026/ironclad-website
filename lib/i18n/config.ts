export const SUPPORTED_LOCALES = [
  "en",
  "zh-CN",
  "ru",
  "es",
  "pt-BR",
  "ko",
  "fr",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE_NAME = "ironclad_locale";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const CLERK_LOCALE_METADATA_KEY = "ironcladLocale";

export type LocaleOption = {
  id: Locale;
  code: string;
  label: string;
  indicator: string;
};

export const LOCALE_OPTIONS = [
  { id: "en", code: "EN", label: "English", indicator: "🌐" },
  { id: "zh-CN", code: "ZH-CN", label: "简体中文", indicator: "🇨🇳" },
  { id: "ru", code: "RU", label: "Русский", indicator: "🇷🇺" },
  { id: "es", code: "ES", label: "Español", indicator: "🇪🇸" },
  {
    id: "pt-BR",
    code: "PT-BR",
    label: "Português (Brasil)",
    indicator: "🇧🇷",
  },
  { id: "ko", code: "KO", label: "한국어", indicator: "🇰🇷" },
  { id: "fr", code: "FR", label: "Français", indicator: "🇫🇷" },
] as const satisfies readonly LocaleOption[];

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

const INTL_LOCALES: Record<Locale, string> = {
  en: "en-AU",
  "zh-CN": "zh-CN",
  ru: "ru-RU",
  es: "es-ES",
  "pt-BR": "pt-BR",
  ko: "ko-KR",
  fr: "fr-FR",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_LOCALE_SET.has(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function toIntlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

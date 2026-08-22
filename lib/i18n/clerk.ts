import "server-only";

import type { Locale } from "@/lib/i18n/config";

const clerkLocaleLoaders = {
  en: () =>
    import("@clerk/localizations/en-US").then(({ enUS }) => enUS),
  it: () =>
    import("@clerk/localizations/it-IT").then(({ itIT }) => itIT),
  "zh-CN": () =>
    import("@clerk/localizations/zh-CN").then(({ zhCN }) => zhCN),
  ru: () =>
    import("@clerk/localizations/ru-RU").then(({ ruRU }) => ruRU),
  es: () =>
    import("@clerk/localizations/es-ES").then(({ esES }) => esES),
  "pt-BR": () =>
    import("@clerk/localizations/pt-BR").then(({ ptBR }) => ptBR),
  ko: () =>
    import("@clerk/localizations/ko-KR").then(({ koKR }) => koKR),
  fr: () =>
    import("@clerk/localizations/fr-FR").then(({ frFR }) => frFR),
} satisfies Record<Locale, () => Promise<object>>;

export function loadClerkLocalization(locale: Locale) {
  return clerkLocaleLoaders[locale]();
}

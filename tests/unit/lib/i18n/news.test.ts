import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import type { CommonDictionary } from "@/lib/i18n/dictionaries/en/common";
import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";
import type { DictionaryTree } from "@/lib/i18n/types";
import { validateDictionary } from "@/lib/i18n/validation";
import commonEn from "@/lib/i18n/dictionaries/en/common";
import publicEn from "@/lib/i18n/dictionaries/en/public";
import commonIt from "@/lib/i18n/dictionaries/it/common";
import publicIt from "@/lib/i18n/dictionaries/it/public";
import commonEs from "@/lib/i18n/dictionaries/es/common";
import publicEs from "@/lib/i18n/dictionaries/es/public";
import commonFr from "@/lib/i18n/dictionaries/fr/common";
import publicFr from "@/lib/i18n/dictionaries/fr/public";
import commonPtBr from "@/lib/i18n/dictionaries/pt-BR/common";
import publicPtBr from "@/lib/i18n/dictionaries/pt-BR/public";
import commonRu from "@/lib/i18n/dictionaries/ru/common";
import publicRu from "@/lib/i18n/dictionaries/ru/public";
import commonKo from "@/lib/i18n/dictionaries/ko/common";
import publicKo from "@/lib/i18n/dictionaries/ko/public";
import commonZhCn from "@/lib/i18n/dictionaries/zh-CN/common";
import publicZhCn from "@/lib/i18n/dictionaries/zh-CN/public";

const dictionaries: Record<
  Locale,
  { common: CommonDictionary; public: PublicDictionary }
> = {
  en: { common: commonEn, public: publicEn },
  it: { common: commonIt, public: publicIt },
  es: { common: commonEs, public: publicEs },
  fr: { common: commonFr, public: publicFr },
  "pt-BR": { common: commonPtBr, public: publicPtBr },
  ru: { common: commonRu, public: publicRu },
  ko: { common: commonKo, public: publicKo },
  "zh-CN": { common: commonZhCn, public: publicZhCn },
};

const navigationKeys = [
  "news",
  "more",
  "updates",
  "compete",
  "information",
  "leaderboards",
] as const;

function flattenStrings(
  tree: DictionaryTree,
  prefix = ""
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string"
        ? [[path, value]]
        : Object.entries(flattenStrings(value, path));
    })
  );
}

describe("official news translations", () => {
  it.each(SUPPORTED_LOCALES)(
    "supplies complete raw news and navigation copy for %s without loader fallback",
    (locale) => {
      const dictionary = dictionaries[locale];

      expect(validateDictionary(publicEn.news, dictionary.public.news)).toEqual([]);
      for (const key of navigationKeys) {
        expect(dictionary.common.nav[key].trim(), `${locale}/nav.${key}`).not.toBe("");
      }
      expect(Object.keys(dictionary.public.news.categories).sort()).toEqual([
        "announcement",
        "patchNotes",
        "update",
      ]);
    }
  );

  it.each(SUPPORTED_LOCALES.filter((locale) => locale !== "en"))(
    "provides authored %s UI translations rather than copied English",
    (locale) => {
      const dictionary = dictionaries[locale];
      const translated = flattenStrings(dictionary.public.news);

      for (const [key, english] of Object.entries(flattenStrings(publicEn.news))) {
        expect(translated[key], `${locale}/news.${key}`).not.toBe(english);
      }
      for (const key of navigationKeys) {
        expect(dictionary.common.nav[key], `${locale}/nav.${key}`).not.toBe(
          commonEn.nav[key]
        );
      }
    }
  );

  it.each(SUPPORTED_LOCALES)(
    "retains source attribution and the independence notice in %s",
    (locale) => {
      const copy = dictionaries[locale].public.news;

      expect(copy.sourceLabel).toContain("Relic Entertainment");
      expect(copy.sourceLabel).toContain("Steam");
      expect(copy.categoryLabel).toContain("IronClad");
      for (const owner of [
        "IronClad Tournaments",
        "Relic Entertainment",
        "Valve",
        "Company of Heroes",
        "Steam",
      ]) {
        expect(copy.disclaimer).toContain(owner);
      }
    }
  );
});

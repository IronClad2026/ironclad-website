import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import { COMPETITION_GLOSSARY } from "@/lib/i18n/glossary";
import {
  loadDictionaries,
  type DictionaryByNamespace,
} from "@/lib/i18n/loaders";

const translatedLocales = SUPPORTED_LOCALES.filter(
  (locale): locale is Exclude<Locale, "en"> => locale !== "en"
);

const namespaces = [
  "common",
  "public",
  "account-dashboard",
  "competition",
  "notifications",
  "email",
  "help-legal-ui",
] as const satisfies readonly (keyof DictionaryByNamespace)[];

const accidentalEnglishPatterns = [
  ["Effective", /\bEffective\b/u],
  ["Effectifs", /\bEffectifs\b/u],
  ["stream sniping", /\bstream sniping\b/iu],
  ["smurf", /\b(?:smurfs?|smurfing)\b/iu],
  ["exploit", /\bexploits?\b/iu],
  ["map pool", /\bmap pools?\b/iu],
] as const;

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];

  return Object.values(value).flatMap(flattenStrings);
}

describe("focused translation quality contract", () => {
  it("keeps known accidental English out of translated fixed copy", async () => {
    for (const locale of translatedLocales) {
      const dictionaries = await loadDictionaries(locale, namespaces);
      const translatedText = flattenStrings(dictionaries).join("\n");

      for (const [label, pattern] of accidentalEnglishPatterns) {
        expect(translatedText, `${locale}/${label}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps representative cross-namespace labels aligned with the glossary", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dictionaries = await loadDictionaries(locale, [
        "public",
        "account-dashboard",
        "competition",
        "notifications",
        "email",
      ] as const);
      const glossary = COMPETITION_GLOSSARY[locale];

      expect(
        dictionaries.competition.tournaments.hero.tournament,
        `${locale}/tournament`
      ).toBe(glossary.tournament);
      expect(
        dictionaries.competition.tournaments.overview.event,
        `${locale}/event`
      ).toBe(glossary.event);
      expect(
        dictionaries.competition.polls.binding,
        `${locale}/binding`
      ).toBe(glossary.binding);
      expect(
        dictionaries.competition.polls.advisory,
        `${locale}/advisory`
      ).toBe(glossary.advisory);
      expect(
        dictionaries.notifications.dashboard.tournament,
        `${locale}/notification-tournament`
      ).toBe(glossary.tournament);
      expect(
        dictionaries.notifications.dashboard.match,
        `${locale}/notification-match`
      ).toBe(glossary.match);
      expect(dictionaries.email.labels.tournament, `${locale}/email-tournament`).toBe(
        glossary.tournament
      );
      expect(dictionaries.email.labels.division, `${locale}/email-division`).toBe(
        glossary.division
      );
      expect(
        dictionaries["account-dashboard"].relic.division,
        `${locale}/account-division`
      ).toBe(glossary.division);
      expect(
        dictionaries["account-dashboard"].dashboard.matchHistory.result,
        `${locale}/account-result`
      ).toBe(glossary.result);
      expect(dictionaries.public.rankings.division, `${locale}/ranking-division`).toBe(
        glossary.division
      );
      expect(dictionaries.public.rankings.season, `${locale}/ranking-season`).toBe(
        glossary.season
      );
    }
  });
});

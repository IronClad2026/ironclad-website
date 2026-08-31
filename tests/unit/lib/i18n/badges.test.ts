import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { loadDictionary } from "@/lib/i18n/loaders";

describe("Badge dictionaries", () => {
  it("covers all 30 canonical Badge definitions in every launch locale", async () => {
    const dictionaries = await Promise.all(
      SUPPORTED_LOCALES.map((locale) => loadDictionary(locale, "badges"))
    );

    for (const dictionary of dictionaries) {
      const definitions = Object.values(dictionary.definitions);
      expect(definitions).toHaveLength(30);
      expect(
        definitions.every(
          (definition) =>
            definition.name.trim().length > 0 &&
            definition.unlockMeaning.trim().length > 0
        )
      ).toBe(true);
      expect(new Set(definitions.map((definition) => definition.name)).size).toBe(
        30
      );
    }
  });

  it("ships distinct localized Badge copy across all eight locales", async () => {
    const dictionaries = await Promise.all(
      SUPPORTED_LOCALES.map((locale) => loadDictionary(locale, "badges"))
    );

    expect(
      new Set(
        dictionaries.map(
          (dictionary) => dictionary.definitions["first-victory"].name
        )
      ).size
    ).toBe(SUPPORTED_LOCALES.length);
    expect(
      new Set(dictionaries.map((dictionary) => dictionary.reveal.ackError)).size
    ).toBe(SUPPORTED_LOCALES.length);
  });

  it("describes Badge 5 from the first completed qualifying division", async () => {
    const english = await loadDictionary("en", "badges");
    const wording =
      english.definitions["rising-through-the-ranks"].unlockMeaning;

    expect(wording).toContain("first division");
    expect(wording).toContain("completed an IronClad tournament");
    expect(wording).not.toContain("originally entered");
  });

  it("describes the locked played-series requirement for Badge 20", async () => {
    const english = await loadDictionary("en", "badges");
    const wording = english.definitions["flawless-campaign"].unlockMeaning;

    expect(wording).toContain("at least one official series");
    expect(wording).toContain("without losing an individual game");
  });
});

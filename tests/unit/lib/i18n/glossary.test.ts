import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import {
  COMPETITION_GLOSSARY,
  LOCKED_COMPETITION_NAMES,
} from "@/lib/i18n/glossary";

describe("competition terminology glossary", () => {
  it("defines a complete fixed-term set for exactly eight locales", () => {
    expect(Object.keys(COMPETITION_GLOSSARY)).toEqual(SUPPORTED_LOCALES);

    const englishKeys = Object.keys(COMPETITION_GLOSSARY.en).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(COMPETITION_GLOSSARY[locale]).sort()).toEqual(
        englishKeys
      );
      expect(Object.values(COMPETITION_GLOSSARY[locale])).not.toContain("");
    }
  });

  it("locks product, provider, division, format, and feature names", () => {
    expect(LOCKED_COMPETITION_NAMES).toEqual(
      expect.arrayContaining([
        "IronClad",
        "Company of Heroes 3",
        "Steam",
        "Relic",
        "ELO",
        "BO3",
        "BO5",
        "Academy",
        "Challenge",
        "Main / Pro",
        "Dice Roll-Off",
      ])
    );
  });
});

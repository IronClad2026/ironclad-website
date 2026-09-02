import { describe, expect, it } from "vitest";
import english from "@/lib/i18n/dictionaries/en/competition";
import spanish from "@/lib/i18n/dictionaries/es/competition";
import french from "@/lib/i18n/dictionaries/fr/competition";
import italian from "@/lib/i18n/dictionaries/it/competition";
import korean from "@/lib/i18n/dictionaries/ko/competition";
import portuguese from "@/lib/i18n/dictionaries/pt-BR/competition";
import russian from "@/lib/i18n/dictionaries/ru/competition";
import chinese from "@/lib/i18n/dictionaries/zh-CN/competition";
import { getInterpolationVariables } from "@/lib/i18n/translate";

const dictionaries = [
  english,
  spanish,
  french,
  italian,
  korean,
  portuguese,
  russian,
  chinese,
];

const divisionStateKeys = [
  "cancelled",
  "completed",
  "disabled",
  "filling",
  "inProgress",
  "ready",
  "voided",
] as const;

describe("Tournament division-state translations", () => {
  it("keeps the required English launch-readiness label exact", () => {
    expect(english.tournaments.divisionState.ready).toBe(
      "Ready to Launch — {approved}/{required}"
    );
  });

  it("keeps every player locale on the same complete shape", () => {
    for (const dictionary of dictionaries) {
      const copy = dictionary.tournaments.divisionState;

      expect(Object.keys(copy).sort()).toEqual(divisionStateKeys);

      for (const value of Object.values(copy)) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("provides localized copy instead of English fallbacks", () => {
    const englishCopy = english.tournaments.divisionState;

    for (const dictionary of dictionaries.slice(1)) {
      const copy = dictionary.tournaments.divisionState;

      for (const key of divisionStateKeys) {
        expect(copy[key]).not.toBe(englishCopy[key]);
      }
    }
  });

  it("preserves readiness-count interpolation without leaking it into fixed labels", () => {
    for (const dictionary of dictionaries) {
      const copy = dictionary.tournaments.divisionState;

      expect(getInterpolationVariables(copy.filling)).toEqual([
        "approved",
        "required",
      ]);
      expect(getInterpolationVariables(copy.ready)).toEqual([
        "approved",
        "required",
      ]);

      for (const [key, value] of Object.entries(copy)) {
        if (key !== "filling" && key !== "ready") {
          expect(getInterpolationVariables(value)).toEqual([]);
        }
      }
    }
  });
});

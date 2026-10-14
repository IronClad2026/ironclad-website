import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import english from "@/lib/i18n/dictionaries/en/account-dashboard";
import { loadDictionary } from "@/lib/i18n/loaders";
import { translate } from "@/lib/i18n/translate";
import type { ShowcaseMessageCode } from "@/lib/player-showcase/types";

const actionMessages = {
  thoughtSaved: true,
  badgeSaved: true,
  moderationSaved: true,
  signInRequired: true,
  profileRequired: true,
  unavailable: true,
  thoughtTooLong: true,
  thoughtInvalid: true,
  invalidAward: true,
  awardNotOwned: true,
  conflict: true,
  saveFailed: true,
  forbidden: true,
  legalRequired: true,
  invalidPlayer: true,
} satisfies Record<ShowcaseMessageCode, true>;

const actionCodes = Object.keys(actionMessages) as ShowcaseMessageCode[];

describe("Player Showcase localization", () => {
  it.each(SUPPORTED_LOCALES)(
    "%s supplies translated copy for every shared action result",
    async (locale) => {
      const dictionary = await loadDictionary(locale, "account-dashboard");

      for (const code of actionCodes) {
        const message = dictionary.showcase[code];
        expect(message.trim(), `${locale}/${code}`).not.toBe("");
        expect(translate(dictionary, `showcase.${code}`)).toBe(message);
        if (locale !== "en") {
          expect(message, `${locale}/${code}`).not.toBe(english.showcase[code]);
        }
      }
    }
  );

  it.each(SUPPORTED_LOCALES)(
    "%s interpolates the thought count and featured badge accessible names",
    async (locale) => {
      const dictionary = await loadDictionary(locale, "account-dashboard");

      expect(
        translate(dictionary, "showcase.characterCount", { count: 159, max: 160 })
      ).toBe("159 / 160");

      for (const key of ["selectBadge", "badgeDetails"] as const) {
        const label = translate(dictionary, `showcase.${key}`, {
          name: "IronClad Recruit",
        });
        expect(label).toContain("IronClad Recruit");
        expect(label).not.toMatch(/\{name\}/u);
      }
    }
  );
});

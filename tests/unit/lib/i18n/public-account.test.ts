import { describe, expect, it } from "vitest";

import { getLocalizedCountryName, getLocalizedCountrySelectOptions } from "@/lib/countries";
import type { Locale } from "@/lib/i18n/config";
import enAccount from "@/lib/i18n/dictionaries/en/account-dashboard";
import enCommon from "@/lib/i18n/dictionaries/en/common";
import enPublic from "@/lib/i18n/dictionaries/en/public";
import esAccount from "@/lib/i18n/dictionaries/es/account-dashboard";
import esCommon from "@/lib/i18n/dictionaries/es/common";
import esPublic from "@/lib/i18n/dictionaries/es/public";
import frAccount from "@/lib/i18n/dictionaries/fr/account-dashboard";
import frCommon from "@/lib/i18n/dictionaries/fr/common";
import frPublic from "@/lib/i18n/dictionaries/fr/public";
import { selectPlural } from "@/lib/i18n/format";
import koAccount from "@/lib/i18n/dictionaries/ko/account-dashboard";
import koCommon from "@/lib/i18n/dictionaries/ko/common";
import koPublic from "@/lib/i18n/dictionaries/ko/public";
import ptBrAccount from "@/lib/i18n/dictionaries/pt-BR/account-dashboard";
import ptBrCommon from "@/lib/i18n/dictionaries/pt-BR/common";
import ptBrPublic from "@/lib/i18n/dictionaries/pt-BR/public";
import ruAccount from "@/lib/i18n/dictionaries/ru/account-dashboard";
import ruCommon from "@/lib/i18n/dictionaries/ru/common";
import ruPublic from "@/lib/i18n/dictionaries/ru/public";
import zhCnAccount from "@/lib/i18n/dictionaries/zh-CN/account-dashboard";
import zhCnCommon from "@/lib/i18n/dictionaries/zh-CN/common";
import zhCnPublic from "@/lib/i18n/dictionaries/zh-CN/public";
import { validateDictionary } from "@/lib/i18n/validation";

const localized = {
  "zh-CN": { account: zhCnAccount, common: zhCnCommon, public: zhCnPublic },
  ru: { account: ruAccount, common: ruCommon, public: ruPublic },
  es: { account: esAccount, common: esCommon, public: esPublic },
  "pt-BR": { account: ptBrAccount, common: ptBrCommon, public: ptBrPublic },
  ko: { account: koAccount, common: koCommon, public: koPublic },
  fr: { account: frAccount, common: frCommon, public: frPublic },
} as const;

describe("public and account localization", () => {
  it.each(Object.entries(localized))(
    "%s matches the English public/account/common source shapes",
    (_locale, dictionaries) => {
      expect(validateDictionary(enPublic, dictionaries.public)).toEqual([]);
      expect(validateDictionary(enAccount, dictionaries.account)).toEqual([]);
      expect(validateDictionary(enCommon, dictionaries.common)).toEqual([]);
    }
  );

  it("localizes country presentation without changing canonical option values", () => {
    expect(getLocalizedCountryName("Germany", "fr")).toBe("Allemagne");
    expect(getLocalizedCountryName("South Korea", "ko")).toBe("대한민국");

    const values = getLocalizedCountrySelectOptions("zh-CN" as Locale).map(
      (option) => option.value
    );
    expect(values).toContain("Germany");
    expect(values).toContain("Korea, Republic of");
  });

  it("preserves Russian few and many player-count forms", () => {
    expect(selectPlural(2, "ru")).toBe("few");
    expect(selectPlural(5, "ru")).toBe("many");
    expect(ruPublic.playerCount.few).toBe("игрока");
    expect(ruPublic.playerCount.many).toBe("игроков");
  });
});

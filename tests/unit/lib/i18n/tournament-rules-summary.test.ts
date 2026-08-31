import { describe, expect, it } from "vitest";

import en from "@/lib/i18n/dictionaries/en/competition";
import es from "@/lib/i18n/dictionaries/es/competition";
import fr from "@/lib/i18n/dictionaries/fr/competition";
import itDictionary from "@/lib/i18n/dictionaries/it/competition";
import ko from "@/lib/i18n/dictionaries/ko/competition";
import ptBr from "@/lib/i18n/dictionaries/pt-BR/competition";
import ru from "@/lib/i18n/dictionaries/ru/competition";
import zhCn from "@/lib/i18n/dictionaries/zh-CN/competition";

const dictionaries = {
  en,
  es,
  fr,
  it: itDictionary,
  ko,
  "pt-BR": ptBr,
  ru,
  "zh-CN": zhCn,
};
describe("Tournament Rules summary localization", () => {
  it("keeps every supported locale complete and preserves the critical rules", () => {
    const englishKeys = Object.keys(en.tournaments.rulesSummary).sort();

    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      const summary = dictionary.tournaments.rulesSummary;
      expect(Object.keys(summary).sort(), locale).toEqual(englishKeys);

      for (const [key, value] of Object.entries(summary)) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }

      expect(summary.formatBody, `${locale} preserves 1v1`).toContain("1v1");
      expect(summary.formatBody, `${locale} preserves 8 Players`).toContain("8");
      expect(summary.seriesBody, `${locale} preserves BO3`).toContain("BO3");
      expect(summary.seriesBody, `${locale} preserves BO5`).toContain("BO5");
      expect(summary.matchTimingBody, `${locale} preserves 7 days`).toContain("7");
      expect(summary.schedulingBody, `${locale} preserves 24 hours`).toContain("24");
      expect(summary.schedulingBody, `${locale} preserves 48 hours`).toContain("48");
      expect(summary.resultsBody, `${locale} preserves .rec`).toContain(".rec");
    }
  });

  it("avoids the dangerous English timing and automatic-outcome claims", () => {
    const copy = JSON.stringify(en.tournaments.rulesSummary).toLowerCase();

    expect(copy).not.toContain("9 days");
    expect(copy).not.toContain("automatic extension");
    expect(copy).not.toContain("automatic win after 48 hours");
    expect(copy).not.toContain("7 days per round");
  });
});

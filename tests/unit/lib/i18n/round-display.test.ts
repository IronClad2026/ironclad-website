import { describe, expect, it } from "vitest";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import competitionSpanish from "@/lib/i18n/dictionaries/es/competition";
import competitionFrench from "@/lib/i18n/dictionaries/fr/competition";
import competitionItalian from "@/lib/i18n/dictionaries/it/competition";
import competitionKorean from "@/lib/i18n/dictionaries/ko/competition";
import competitionPortuguese from "@/lib/i18n/dictionaries/pt-BR/competition";
import competitionRussian from "@/lib/i18n/dictionaries/ru/competition";
import competitionChinese from "@/lib/i18n/dictionaries/zh-CN/competition";
import { localizeBracketRoundName } from "@/lib/i18n/round-display";
import { translate } from "@/lib/i18n/translate";
import type { DictionaryTree } from "@/lib/i18n/types";

const localeDictionaries = [
  ["en", competitionEnglish],
  ["it", competitionItalian],
  ["zh-CN", competitionChinese],
  ["ru", competitionRussian],
  ["es", competitionSpanish],
  ["pt-BR", competitionPortuguese],
  ["ko", competitionKorean],
  ["fr", competitionFrench],
] as const satisfies ReadonlyArray<readonly [string, DictionaryTree]>;

const aliases = [
  ["Quarterfinal", "bracketPresentation.roundNames.quarterfinals"],
  ["Quarterfinals", "bracketPresentation.roundNames.quarterfinals"],
  ["Quarter Final", "bracketPresentation.roundNames.quarterfinals"],
  ["Quarter Finals", "bracketPresentation.roundNames.quarterfinals"],
  ["Quarter-Final", "bracketPresentation.roundNames.quarterfinals"],
  ["Quarter-Finals", "bracketPresentation.roundNames.quarterfinals"],
  ["Semifinal", "bracketPresentation.roundNames.semifinals"],
  ["Semifinals", "bracketPresentation.roundNames.semifinals"],
  ["Semi Final", "bracketPresentation.roundNames.semifinals"],
  ["Semi Finals", "bracketPresentation.roundNames.semifinals"],
  ["Semi-Final", "bracketPresentation.roundNames.semifinals"],
  ["Semi-Finals", "bracketPresentation.roundNames.semifinals"],
  ["Final", "bracketPresentation.roundNames.final"],
  ["Grand Final", "bracketPresentation.roundNames.grandFinal"],
  ["Round Robin", "tournaments.brackets.roundRobin"],
] as const;

describe("localizeBracketRoundName", () => {
  it.each(localeDictionaries)(
    "normalizes canonical aliases for %s",
    (_locale, dictionary) => {
      const t = (path: string, values = {}) =>
        translate(dictionary, path, values);

      for (const [alias, path] of aliases) {
        expect(localizeBracketRoundName(alias, t)).toBe(translate(dictionary, path));
      }

      expect(localizeBracketRoundName("Round of 16", t)).toBe(
        translate(dictionary, "bracketPresentation.roundNames.roundOf", {
          count: "16",
        })
      );
      expect(localizeBracketRoundName("Lower Bracket Round 2", t)).toBe(
        "Lower Bracket Round 2"
      );
    }
  );
});

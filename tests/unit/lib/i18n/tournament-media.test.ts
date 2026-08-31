import { describe, expect, it } from "vitest";
import english from "@/lib/i18n/dictionaries/en/competition";
import spanish from "@/lib/i18n/dictionaries/es/competition";
import french from "@/lib/i18n/dictionaries/fr/competition";
import italian from "@/lib/i18n/dictionaries/it/competition";
import korean from "@/lib/i18n/dictionaries/ko/competition";
import portuguese from "@/lib/i18n/dictionaries/pt-BR/competition";
import russian from "@/lib/i18n/dictionaries/ru/competition";
import chinese from "@/lib/i18n/dictionaries/zh-CN/competition";

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

describe("Tournament media translations", () => {
  it("keeps every player locale on the same complete shape", () => {
    for (const dictionary of dictionaries) {
      expect(dictionary.tournaments.media.title).toBeTruthy();
      expect(dictionary.tournaments.media.empty).toBeTruthy();
      expect(dictionary.tournaments.media.watch).toBeTruthy();
      expect(dictionary.tournaments.media.opensNewTab).toBeTruthy();
      expect(Object.keys(dictionary.tournaments.media.types).sort()).toEqual([
        "fullTournament",
        "matchCast",
        "other",
        "video",
      ]);
    }
  });
});

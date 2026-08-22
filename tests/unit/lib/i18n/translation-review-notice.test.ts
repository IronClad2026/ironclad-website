import { describe, expect, it } from "vitest";

import en from "@/lib/i18n/dictionaries/en/common";
import es from "@/lib/i18n/dictionaries/es/common";
import fr from "@/lib/i18n/dictionaries/fr/common";
import itCommon from "@/lib/i18n/dictionaries/it/common";
import ko from "@/lib/i18n/dictionaries/ko/common";
import ptBR from "@/lib/i18n/dictionaries/pt-BR/common";
import ru from "@/lib/i18n/dictionaries/ru/common";
import zhCN from "@/lib/i18n/dictionaries/zh-CN/common";

const notices = {
  en: en.selector.translationReviewNotice,
  it: itCommon.selector.translationReviewNotice,
  "zh-CN": zhCN.selector.translationReviewNotice,
  ru: ru.selector.translationReviewNotice,
  es: es.selector.translationReviewNotice,
  "pt-BR": ptBR.selector.translationReviewNotice,
  ko: ko.selector.translationReviewNotice,
  fr: fr.selector.translationReviewNotice,
} as const;

const reviewedCopy = {
  en: "Translations are provided for convenience and have been carefully reviewed, but may not have been reviewed by a native speaker. English remains the source language.",
  it: "Le traduzioni sono fornite per comodità e sono state revisionate con cura, ma potrebbero non essere state verificate da un madrelingua. L’inglese rimane la lingua di riferimento.",
  "zh-CN":
    "网站译文旨在方便您使用，且已经过认真审核，但不一定由母语人士审校。英文仍为源语言。",
  ru: "Переводы предоставлены для удобства и были тщательно проверены, однако их мог не проверять носитель языка. Исходным языком остаётся английский.",
  es: "Las traducciones se ofrecen para facilitar el uso y se han revisado cuidadosamente, aunque es posible que no las haya revisado un hablante nativo. El inglés sigue siendo el idioma de origen.",
  "pt-BR":
    "As traduções são fornecidas por conveniência e foram revisadas com cuidado, mas podem não ter sido revisadas por um falante nativo. O inglês continua sendo o idioma de origem.",
  ko: "번역은 편의를 위해 제공되며 꼼꼼히 검토되었지만, 원어민의 검수를 거치지 않았을 수 있습니다. 영어가 원문 언어입니다.",
  fr: "Les traductions sont fournies pour faciliter l’utilisation et ont été relues avec soin, mais elles n’ont pas nécessairement été relues par une personne de langue maternelle. L’anglais reste la langue source.",
} as const;

describe("language-selector translation review notice", () => {
  it("keeps the reviewed notice copy exact in every launch locale", () => {
    expect(notices).toEqual(reviewedCopy);
  });

  it("uses a distinct, non-blank notice for every launch locale", () => {
    expect(Object.values(notices).every((notice) => notice.trim().length > 0)).toBe(
      true
    );
    expect(new Set(Object.values(notices))).toHaveLength(8);
  });
});

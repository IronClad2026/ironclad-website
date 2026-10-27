import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/lib/i18n/dictionaries/en/help-legal-ui";
import es from "@/lib/i18n/dictionaries/es/help-legal-ui";
import fr from "@/lib/i18n/dictionaries/fr/help-legal-ui";
import itHelpLegalUi from "@/lib/i18n/dictionaries/it/help-legal-ui";
import ko from "@/lib/i18n/dictionaries/ko/help-legal-ui";
import ptBR from "@/lib/i18n/dictionaries/pt-BR/help-legal-ui";
import ru from "@/lib/i18n/dictionaries/ru/help-legal-ui";
import zhCN from "@/lib/i18n/dictionaries/zh-CN/help-legal-ui";
import { validateDictionary } from "@/lib/i18n/validation";
import { LOCKED_COMPETITION_NAMES } from "@/lib/i18n/glossary";

const root = process.cwd();
const translations = {
  en,
  it: itHelpLegalUi,
  es,
  fr,
  ko,
  "pt-BR": ptBR,
  ru,
  "zh-CN": zhCN,
};

function flatten(value: unknown, path = "", result = new Map<string, string>()) {
  if (typeof value === "string") {
    result.set(path, value);
    return result;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flatten(child, path ? `${path}.${key}` : key, result);
  }

  return result;
}

describe("help and legal localization contract", () => {
  it("keeps every locale complete, nonblank, and interpolation-compatible", () => {
    for (const [locale, dictionary] of Object.entries(translations)) {
      expect(validateDictionary(en, dictionary), locale).toEqual([]);
    }
  });

  it("provides the controlling-English notice in every locale", () => {
    for (const [locale, dictionary] of Object.entries(translations)) {
      expect(dictionary.legalPage.effectiveEnglishNotice, locale).not.toBe("");
      expect(dictionary.rules.disclaimer.english, locale).not.toBe("");
    }

    expect(
      new Set(
        Object.values(translations).map(
          (dictionary) => dictionary.legalPage.effectiveEnglishNotice
        )
      ).size
    ).toBe(8);
  });

  it.each([
    ["en", [
      /competitive profiles.*accounts.*not been closed.*public/i,
      /Discord.*separate opt-in/,
      /Private replays.*access-controlled/,
      /Closed accounts.*excluded from public profiles/,
    ]],
    ["it", [
      /profili competitivi.*account non chiusi.*pubblici/,
      /Discord.*scelta separata.*esplicitamente/,
      /Replay privati.*controllo degli accessi/,
      /account chiusi.*esclusi dai profili pubblici/,
    ]],
    ["es", [
      /perfiles competitivos.*cuentas que no se han cerrado.*públicos/,
      /Discord.*opción independiente.*activar/,
      /repeticiones privadas.*controles de acceso/,
      /cuentas cerradas.*excluidas de los perfiles públicos/,
    ]],
    ["fr", [
      /profils compétitifs.*comptes non clôturés.*publics/,
      /Discord.*option distincte.*activer/,
      /replays privés.*contrôle d’accès/,
      /comptes clôturés.*exclus des profils publics/,
    ]],
    ["ko", [
      /종료되지 않은 계정.*경쟁 프로필.*공개/,
      /Discord.*별도로 선택/,
      /비공개 리플레이.*접근 통제/,
      /종료된 계정.*공개 프로필에서 제외/,
    ]],
    ["pt-BR", [
      /perfis competitivos.*contas que não foram encerradas.*públicos/,
      /Discord.*escolha independente.*ativação/,
      /Replays privados.*acesso controlado/,
      /Contas encerradas.*excluídas dos perfis públicos/,
    ]],
    ["ru", [
      /профили незакрытых аккаунтов публичны/,
      /Discord.*отдельной опцией.*явного включения/,
      /Приватные Реплеи.*контролем доступа/,
      /Закрытые аккаунты.*исключены из публичных профилей/,
    ]],
    ["zh-CN", [
      /未关闭账户.*竞技资料.*公开/,
      /Discord.*单独选择启用/,
      /私密回放.*访问控制/,
      /已关闭账户不出现在公开个人资料/,
    ]],
  ] as const)("explains public profiles and independent privacy controls in %s", (locale, checks) => {
    const privacyText = translations[locale].rules.sections.conduct.privacyText;
    for (const check of checks) expect(privacyText, locale).toMatch(check);
  });

  it("aligns Rulebook and PPA category labels with the Effective legal corpus", () => {
    const corpus = JSON.parse(
      readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
    ) as {
      documents: { kind: string; status: string; version: string }[];
    };
    const rulebook = corpus.documents.find(
      (document) => document.kind === "rulebook"
    );
    const ppa = corpus.documents.find((document) => document.kind === "ppa");

    if (!rulebook || !ppa) {
      throw new Error("The Effective Rulebook and PPA must exist in the legal corpus.");
    }

    expect(rulebook.status).toBe("Effective");
    expect(ppa.status).toBe("Effective");

    const draftTerms =
      /(?:draft|provisional|bozza|provvisori|borrador|brouillon|provisoire|rascunho|provisóri|черновик|предварительн|초안|임시|草案|草稿|暂定|暫定)/iu;

    for (const [locale, dictionary] of Object.entries(translations)) {
      const categoryDocuments = [
        ["oneVOne", dictionary.rules.tabs.oneVOne.document, rulebook],
        ["conduct", dictionary.rules.tabs.conduct.document, ppa],
      ] as const;

      for (const [category, label, document] of categoryDocuments) {
        expect(
          label.match(/v\d+(?:\.\d+)*/g),
          `${locale}/${category}`
        ).toEqual([`v${document.version}`]);
        expect(
          dictionary.rules.category.primaryDraft.replace("{document}", label),
          `${locale}/${category}`
        ).not.toMatch(draftTerms);
      }
    }
  });

  it("preserves locked IronClad and competition names in translated copy", () => {
    const englishText = [...flatten(en).values()].join("\n");

    for (const [locale, dictionary] of Object.entries(translations)) {
      if (locale === "en") continue;
      const candidateText = [...flatten(dictionary).values()].join("\n");

      for (const lockedName of LOCKED_COMPETITION_NAMES) {
        if (englishText.includes(lockedName)) {
          expect(candidateText, `${locale}/${lockedName}`).toContain(lockedName);
        }
      }
    }
  });

  it("keeps the current Rulebook and PPA source documents exact", () => {
    const corpus = JSON.parse(
      readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
    ) as { documents: { kind: string }[] };
    const expected = {
      ppa: "d4dc5681483ec2530047e09ce82b9067569dff4be5b91a0f468bcdcd0a5e3c28",
      rulebook:
        "35694e6a36f6f57da825d80095186fa41670fceaf1db330b7d348f661bbdfce3",
    };

    for (const [kind, sha256] of Object.entries(expected)) {
      const document = corpus.documents.find((candidate) => candidate.kind === kind);
      expect(document, kind).toBeDefined();
      expect(
        createHash("sha256").update(JSON.stringify(document)).digest("hex"),
        kind
      ).toBe(sha256);
    }
  });

  it("keeps the full corpus out of the Rules client module", () => {
    const clientSource = readFileSync(
      join(root, "components", "rules", "RulesExperience.tsx"),
      "utf8"
    );
    const serverSource = readFileSync(
      join(root, "app", "rules", "page.tsx"),
      "utf8"
    );

    expect(clientSource).not.toContain("content/legal-corpus.json");
    expect(clientSource).not.toContain("legalCorpus");
    expect(serverSource).toContain("legalCorpus.documents.map");
    expect(serverSource).not.toContain("document.sections");
    expect(serverSource).not.toContain("document.operatorStatement");
  });

  it("marks the substantive Terms and Privacy article as English", () => {
    const source = readFileSync(
      join(root, "components", "legal", "LegalDocumentPage.tsx"),
      "utf8"
    );

    expect(source).toMatch(/<article className="min-w-0" lang="en">/);
    expect(source).toContain("copy.legalPage.effectiveEnglishNotice");
  });
});

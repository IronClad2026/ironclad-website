import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/lib/i18n/dictionaries/en/help-legal-ui";
import es from "@/lib/i18n/dictionaries/es/help-legal-ui";
import fr from "@/lib/i18n/dictionaries/fr/help-legal-ui";
import ko from "@/lib/i18n/dictionaries/ko/help-legal-ui";
import ptBR from "@/lib/i18n/dictionaries/pt-BR/help-legal-ui";
import ru from "@/lib/i18n/dictionaries/ru/help-legal-ui";
import zhCN from "@/lib/i18n/dictionaries/zh-CN/help-legal-ui";
import { validateDictionary } from "@/lib/i18n/validation";
import { LOCKED_COMPETITION_NAMES } from "@/lib/i18n/glossary";

const root = process.cwd();
const translations = { en, es, fr, ko, "pt-BR": ptBR, ru, "zh-CN": zhCN };

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

    expect(new Set(Object.values(translations).map((dictionary) => dictionary.legalPage.effectiveEnglishNotice)).size).toBe(7);
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

  it("keeps the unchanged Rulebook and PPA source documents exact", () => {
    const corpus = JSON.parse(
      readFileSync(join(root, "content", "legal-corpus.json"), "utf8")
    ) as { documents: { kind: string }[] };
    const expected = {
      ppa: "e7ecbca6de3d2bf1edf808ce82e4e2eabc61e972c4234e77dff7de10db8f60ae",
      rulebook:
        "3280648ccfe591a3b7d38d7b4d872459a1dda90f9f39ca390e352d34af8b2084",
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

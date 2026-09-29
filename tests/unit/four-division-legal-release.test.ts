import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFourDivisionLegalSql,
  STAGING_PROJECT_REF,
  validateFourDivisionLegalRelease,
} from "../../scripts/four-division/legal-publication.mjs";

describe("four-division legal successor", () => {
  it("binds two new PDFs and preserves the exact Terms, Privacy and predecessor artifacts", () => {
    const release = validateFourDivisionLegalRelease();
    expect(release.documents.map((document: { kind: string; version: string }) => [document.kind, document.version]))
      .toEqual([["rulebook", "3.2"], ["ppa", "3.2"]]);
  });

  it("states separate future eligibility, scoring, season authority and historical preservation", () => {
    const corpus = JSON.parse(readFileSync("content/legal-corpus.json", "utf8"));
    const rulebook = corpus.documents.find((document: { kind: string }) => document.kind === "rulebook");
    const ppa = corpus.documents.find((document: { kind: string }) => document.kind === "ppa");
    for (const document of [rulebook, ppa]) {
      const text = JSON.stringify(document);
      expect(text).toContain('["Main","1400-1699"]');
      expect(text).toContain('["Pro","1700+"]');
      expect(text).toContain("Historical records are not reclassified");
    }
    const text = JSON.stringify(rulebook);
    expect(text).toContain("champion earns 25 points");
    expect(text).toContain("without an additional round-passed award for the Final");
    expect(text).toContain("Only one official season is active");
    expect(text).toContain("never for Main, Pro or historical Main / Pro");
    expect(text).toContain("Pro settlement does not wait for other Divisions");
  });

  it("defaults to rollback and rejects other projects, aliases and external document origins", () => {
    const options = { projectRef: STAGING_PROJECT_REF, origin: "https://ironclad-website-test12345-ironclad-tournaments.vercel.app" };
    const sql = buildFourDivisionLegalSql(options);
    expect(sql.trim().endsWith("rollback;")).toBe(true);
    expect(sql).toContain("Legal publication changed protected identities or acceptance evidence");
    expect(() => buildFourDivisionLegalSql({ ...options, projectRef: "other-project" })).toThrow();
    expect(() => buildFourDivisionLegalSql({ ...options, origin: "https://www.ironcladtournaments.com" })).toThrow();
    expect(() => buildFourDivisionLegalSql({ ...options, origin: "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app" })).toThrow();
    expect(buildFourDivisionLegalSql({ ...options, apply: true }).trim().endsWith("commit;")).toBe(true);
  });
});

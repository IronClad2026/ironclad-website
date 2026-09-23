import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { finalizeP03PrivacyCorpus, buildP03PrivacyRelease } from "../../scripts/legal-successor/prepare-p03-privacy.mjs";
import { validateP03LegalRuntime } from "../../scripts/legal-successor/p03-legal-runtime.mjs";

const root = process.cwd();
const predecessorPath = "docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json";
const previousReleasePath = "docs/legal-drafts/p03-privacy-v1.3/predecessor-release.json";
const predecessor = JSON.parse(readFileSync(predecessorPath, "utf8"));
const source = JSON.parse(readFileSync("content/legal-privacy-successor-v1.3.json", "utf8"));

describe("mechanical P03 legal staging", () => {
  it("stages only the exact clean/date-bound local candidate and refuses retries or mixed runtime", () => {
    const directory = mkdtempSync(join(tmpdir(), "ironclad-p03-legal-stage-test-"));
    try {
      for (const file of [predecessorPath, previousReleasePath, "content/legal-privacy-successor-v1.3.json", "docs/legal-drafts/p03-privacy-v1.3/legal-corpus.json", ...predecessor.documents.map((document: { publicPath: string }) => `public${document.publicPath}`)]) {
        mkdirSync(dirname(join(directory, file)), { recursive: true });
        copyFileSync(join(root, file), join(directory, file));
      }
      copyFileSync(join(root, predecessorPath), join(directory, "content/legal-corpus.json"));
      copyFileSync(join(root, previousReleasePath), join(directory, "content/legal-successor-release.json"));
      writeFileSync(join(directory, ".gitignore"), "p03-artifacts/\n");
      const git = (args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      git(["init", "--initial-branch=codex/p03-production-ready"]);
      git(["add", "."]);
      git(["-c", "user.name=P03 test", "-c", "user.email=p03-test@example.invalid", "commit", "--no-gpg-sign", "-m", "Synthetic local staging fixture"]);
      const head = git(["rev-parse", "HEAD"]);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const staged = finalizeP03PrivacyCorpus(predecessor, source, date);
      // Minimal metadata bytes exercise the staging contract. Rendering of the
      // real generated PDF is separately verified by the publication rehearsal.
      const pdf = Buffer.from(`%PDF-1.4\n/Subject (Effective ${staged.effectiveDateDisplay})\n%%EOF`, "latin1");
      const release = buildP03PrivacyRelease(predecessor, staged, pdf, directory);
      const bundle = join(directory, "p03-artifacts/package");
      mkdirSync(bundle, { recursive: true });
      writeFileSync(join(bundle, "legal-corpus.json"), JSON.stringify(staged));
      writeFileSync(join(bundle, "legal-successor-release.json"), JSON.stringify(release));
      writeFileSync(join(bundle, "ironclad-privacy-policy-v1.3.pdf"), pdf);
      const invoke = (sha: string) => spawnSync(process.execPath, [join(root, "scripts/legal-successor/stage-p03-privacy.mjs"), "--package-dir", bundle, "--expected-head", sha], { cwd: directory, encoding: "utf8" });
      expect(invoke("0".repeat(40)).status).not.toBe(0);
      expect(validateP03LegalRuntime(directory).mode).toBe("prepared-review");
      const publication = (output: string) => spawnSync(process.execPath, [join(root, "scripts/legal-successor/p03-privacy-publication.mjs"), "--package-dir", bundle, "--out", join(bundle, output)], { cwd: directory, encoding: "utf8" });
      expect(publication("before-stage.sql").status).not.toBe(0);
      const applied = invoke(head);
      expect(applied.status, applied.stderr).toBe(0);
      expect(validateP03LegalRuntime(directory)).toMatchObject({ mode: "finalized-successor", effectiveDate: date });
      expect(git(["rev-parse", "HEAD"])).toBe(head);
      expect(invoke(head).status).not.toBe(0);
      const rollback = publication("rollback.sql");
      expect(rollback.status, rollback.stderr).toBe(0);
      expect(readFileSync(join(bundle, "rollback.sql"), "utf8")).toMatch(/rollback;\s*$/);
      const altered = structuredClone(staged);
      altered.documents.find((document: { kind: string }) => document.kind === "privacy").sections[0].title = "Unreviewed wording";
      writeFileSync(join(bundle, "legal-corpus.json"), JSON.stringify(altered));
      expect(publication("wrong-package.sql").status).not.toBe(0);
      writeFileSync(join(bundle, "legal-corpus.json"), JSON.stringify(staged));
      copyFileSync(join(root, previousReleasePath), join(directory, "content/legal-successor-release.json"));
      expect(() => validateP03LegalRuntime(directory)).toThrow();
    } finally {
      if (!resolve(directory).startsWith(resolve(tmpdir()) + "/") && !resolve(directory).startsWith(resolve(tmpdir()) + "\\")) throw new Error("Test cleanup escaped temporary directory.");
      if (!directory.includes("ironclad-p03-legal-stage-test-")) throw new Error("Unexpected test cleanup target.");
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

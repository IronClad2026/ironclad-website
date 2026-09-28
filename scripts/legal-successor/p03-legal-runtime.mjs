import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { applyP03PrivacyDraft, finalizeP03PrivacyCorpus, buildP03PrivacyRelease } from "./prepare-p03-privacy.mjs";

export const P03_LEGAL_PREDECESSOR_CORPUS = "docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json";
export const P03_LEGAL_PREDECESSOR_RELEASE = "docs/legal-drafts/p03-privacy-v1.3/predecessor-release.json";
const readJson = (root, file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// No activation occurs. Accept only the pinned predecessor, or the exact dated
// successor derived from the owner-approved operations. Unknown/mixed states fail.
export function validateP03LegalRuntime(repository) {
  const predecessor = readJson(repository, P03_LEGAL_PREDECESSOR_CORPUS);
  const previousRelease = readJson(repository, P03_LEGAL_PREDECESSOR_RELEASE);
  const source = readJson(repository, "content/legal-privacy-successor-v1.3.json");
  const reviewed = readJson(repository, "docs/legal-drafts/p03-privacy-v1.3/legal-corpus.json");
  if (!isDeepStrictEqual(applyP03PrivacyDraft(predecessor, source), reviewed)) throw new Error("Privacy review corpus differs from approved successor operations.");
  const corpus = readJson(repository, "content/legal-corpus.json");
  const release = readJson(repository, "content/legal-successor-release.json");
  if (isDeepStrictEqual(corpus, predecessor) && isDeepStrictEqual(release, previousRelease)) {
    return { mode: "prepared-review", runtimePrivacyVersion: "1.2", effectiveDate: null };
  }
  if (release?.status !== "Final" || typeof release.effectiveDate !== "string") throw new Error("Runtime legal state is neither exact predecessor nor finalized successor.");
  const expectedCorpus = finalizeP03PrivacyCorpus(predecessor, source, release.effectiveDate);
  if (!isDeepStrictEqual(corpus, expectedCorpus)) throw new Error("Runtime Privacy successor wording/date or unchanged documents differ.");
  const pdfBytes = readFileSync(path.join(repository, "public/documents-rules-ppa/ironclad-privacy-policy-v1.3.pdf"));
  const expectedRelease = buildP03PrivacyRelease(predecessor, expectedCorpus, pdfBytes, repository);
  if (!isDeepStrictEqual(release, expectedRelease)) throw new Error("Runtime Final legal transition/PDF differs from the exact successor.");
  return { mode: "finalized-successor", runtimePrivacyVersion: "1.3", effectiveDate: release.effectiveDate, pdfSha256: sha(pdfBytes) };
}

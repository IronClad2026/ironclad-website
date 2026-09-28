import { readFileSync } from "node:fs";
import path from "node:path";
import { canonical, digest, invariant, readJson, sha256 } from "./core.mjs";
import { validateP03LegalRuntime } from "../legal-successor/p03-legal-runtime.mjs";

export const APPROVED_POLICY = Object.freeze({ routineDays: 40, anchor: "authoritative-current-tournament-closure", supportCaseMonths: 24, resultIntegrityMonths: 24, bodyClassification: false });
export function privacyArtifactHash(repository, artifact) {
  invariant(artifact && typeof artifact.path === "string" && !artifact.path.includes("\\") && !path.isAbsolute(artifact.path), "Privacy artifact needs a repository-relative path.");
  const filename = path.resolve(repository, artifact.path);
  const relative = path.relative(path.resolve(repository), filename);
  invariant(relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "Privacy artifact escapes the candidate.");
  invariant(["utf8-lf", "binary"].includes(artifact.encoding), "Privacy artifact encoding must be explicit.");
  const content = readFileSync(filename);
  return sha256(artifact.encoding === "utf8-lf" ? content.toString("utf8").replaceAll("\r\n", "\n") : content);
}
export function validatePrivacyReadiness(repository, manifestFile, migrations, { live = false, now = new Date() } = {}) {
  const value = readJson(manifestFile);
  invariant(value.schemaVersion === 1 && canonical(value.policy) === canonical(APPROVED_POLICY), "Privacy readiness does not match the approved 40-day/current-closure and existing 24-month policy.");
  invariant(value.publication?.status === "Review Draft" && value.publication.runtimeActivated === false && value.publication.effectiveDate === null, "Prepared legal successor must remain a non-effective review draft.");
  invariant(typeof value.retentionMigration === "string" && value.retentionMigration.endsWith("_match_room_retention_and_privacy.sql") && migrations.some((item) => item.file === value.retentionMigration), "Implemented retention migration is not bound to the atomic package.");
  invariant(value.privacyOperations === "scripts/p03-release/privacy.mjs", "Verified admin-controlled privacy operations are not bound.");
  invariant(Array.isArray(value.artifacts) && value.artifacts.length >= 8 && value.artifacts.length <= 30, "Privacy artifact inventory is incomplete or unbounded.");
  const names = value.artifacts.map((item) => item.path);
  invariant(new Set(names).size === names.length, "Privacy artifact inventory has duplicate paths.");
  const required = [
    `supabase/migrations/${value.retentionMigration}`, value.privacyOperations,
    "scripts/p03-release/privacy-operations.md", "content/legal-privacy-successor-v1.3.json",
    "docs/legal-drafts/p03-privacy-v1.3/legal-corpus.json",
    "docs/legal-drafts/p03-privacy-v1.3/ironclad-privacy-policy-v1.3.pdf",
    "docs/legal-drafts/p03-privacy-v1.3/review-manifest.json",
    "docs/p03-retention-decision.json", "docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json", "docs/legal-drafts/p03-privacy-v1.3/predecessor-release.json",
    "scripts/legal-successor/prepare-p03-privacy.mjs", "scripts/legal-successor/p03-privacy-publication.mjs",
    "scripts/legal-successor/p03-legal-runtime.mjs",
  ];
  invariant(required.every((file) => names.includes(file)) && names.some((file) => /^tests\/(?:p03-db|database)\/.*retention.*\.(?:sql|mjs)$/.test(file)), "Retention implementation, tests, operations, or actual legal review artifacts are missing.");
  for (const artifact of value.artifacts) invariant(/^[a-f0-9]{64}$/.test(artifact.sha256) && privacyArtifactHash(repository, artifact) === artifact.sha256, `Privacy artifact changed: ${artifact.path}.`);
  const decision = readJson(path.join(repository, "docs/p03-retention-decision.json"));
  invariant(decision.schemaVersion === 1 && decision.status === "Owner approved" && decision.routine?.days === 40 && decision.routine.anchor === APPROVED_POLICY.anchor && decision.routine.individualMatchCompletionIsAnchor === false && decision.formalCases?.supportCaseMonths === 24 && decision.formalCases.resultIntegrityMonths === 24 && decision.formalCases.messageTextClassification === false && decision.publication?.reviewDraftOnly === true && decision.publication.productionActivationAuthorized === false && decision.productionMutationsAuthorized === false, "Approved owner decision or preparation-only publication authority differs.");
  const successor = readJson(path.join(repository, "content/legal-privacy-successor-v1.3.json"));
  invariant(successor.schemaVersion === 1 && successor.status === "Review Draft" && successor.effectiveDateToken === "{{PRODUCTION_EFFECTIVE_DATE}}" && successor.documents?.length === 1 && successor.documents[0].kind === "privacy" && successor.documents[0].fromVersion === "1.2" && successor.documents[0].version === "1.3", "Only the reviewed Privacy 1.2-to-1.3 successor may be prepared; do not activate it during preparation.");
  const review = readJson(path.join(repository, "docs/legal-drafts/p03-privacy-v1.3/review-manifest.json"));
  invariant(review.status === "Review Draft" && review.effectiveDate === null && review.pdfSha256 === value.artifacts.find((item) => item.path.endsWith("/ironclad-privacy-policy-v1.3.pdf")).sha256, "Review PDF/manifest binding differs or has become effective.");
  const runtime = validateP03LegalRuntime(repository);
  if (live) {
    invariant(runtime.mode === "finalized-successor", "The live release gate requires the exact finalized Privacy 1.3 successor; review preparation alone cannot pass.");
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const date = ["year", "month", "day"].map((type) => parts.find((item) => item.type === type)?.value).join("-");
    invariant(runtime.effectiveDate === date, "Finalized Privacy successor date must equal the actual Australia/Sydney live-gate date.");
  }
  return { policy: value.policy, retentionMigration: value.retentionMigration, artifactsSha256: digest(value.artifacts), publication: value.publication, runtime, activationRequirement: "Publish the exact approved Privacy 1.3 successor through the existing legal authority and require current-account acceptance while Match Room remains OFF, before activation." };
}

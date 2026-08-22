#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { validateFinalPrivacyRelease } from "./privacy-document-successor-v1.2.mjs";

const SYDNEY_TIME_ZONE = "Australia/Sydney";
const PRODUCTION_ORIGIN = "https://www.ironcladtournaments.com";
const CORPUS_PATH = resolve("content/legal-corpus.json");
const RUNTIME_RELEASE_PATH = resolve("content/legal-successor-release.json");
const DRAFT_PATH = resolve("content/legal-privacy-successor-v1.2.json");
const CANDIDATE_PATH = resolve(
  "content/legal-privacy-successor-v1.2-release-candidate.json"
);
const PUBLIC_DIRECTORY = resolve("public/documents-rules-ppa");
const GENERATOR_PATH = resolve("scripts/generate-legal-pdfs.py");

const SUCCESSOR = Object.freeze({
  filename: "ironclad-privacy-policy-v1.2.pdf",
  fromVersion: "1.1",
  kind: "privacy",
  publicPath: "/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf",
  version: "1.2",
});

const CURRENT_RUNTIME_DOCUMENTS = Object.freeze({
  rulebook: Object.freeze({
    effectiveDate: "2026-08-18",
    filename: "ironclad-official-tournament-rulebook-v3.0.pdf",
    version: "3.0",
  }),
  ppa: Object.freeze({
    effectiveDate: "2026-08-18",
    filename: "ironclad-player-participation-agreement-v3.0.pdf",
    version: "3.0",
  }),
  terms: Object.freeze({
    effectiveDate: "2026-08-20",
    filename: "ironclad-terms-of-service-v1.1.pdf",
    version: "1.1",
  }),
  privacy: Object.freeze({
    effectiveDate: "2026-08-20",
    filename: "ironclad-privacy-policy-v1.1.pdf",
    version: "1.1",
  }),
});

const LOCKED_PUBLISHED_ARTIFACTS = Object.freeze({
  "ironclad-official-tournament-rulebook-v3.0.pdf":
    "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
  "ironclad-player-participation-agreement-v3.0.pdf":
    "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
  "ironclad-terms-of-service-v1.0.pdf":
    "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
  "ironclad-privacy-policy-v1.0.pdf":
    "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
  "ironclad-terms-of-service-v1.1.pdf":
    "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
  "ironclad-privacy-policy-v1.1.pdf":
    "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
});

const DISALLOWED_DASHES = /[‐‑‒–—−]/u;

export function applyPrivacySuccessorDraft(corpus, draft) {
  assertCurrentRuntimeCorpus(corpus);
  assertReviewDraft(draft);

  const next = structuredClone(corpus);
  const unchanged = new Map(
    next.documents
      .filter((document) => document.kind !== "privacy")
      .map((document) => [document.kind, JSON.stringify(document)])
  );
  const document = next.documents.find(
    (candidate) => candidate.kind === "privacy"
  );
  const successor = draft.documents[0];

  document.version = successor.version;
  document.filename = successor.filename;
  document.publicPath = successor.publicPath;
  document.status = "Review Draft";
  document.effectiveDate = null;
  for (const operation of successor.operations) {
    applyOperation(document, operation);
  }

  for (const [kind, serialized] of unchanged) {
    const current = next.documents.find((candidate) => candidate.kind === kind);
    if (JSON.stringify(current) !== serialized) {
      throw new Error(`${kind} changed during Privacy v1.2 draft preparation.`);
    }
  }
  if (document.kind !== "privacy" || document.version !== "1.2") {
    throw new Error("Privacy v1.2 draft identity was not established.");
  }
  if (JSON.stringify(next).includes("{{PRODUCTION_EFFECTIVE_DATE}}")) {
    throw new Error("A publication-date token leaked into the staged corpus.");
  }
  return next;
}

export function finalizePrivacySuccessor(corpus, draft, activationDate) {
  assertCalendarDate(activationDate);
  const next = applyPrivacySuccessorDraft(corpus, draft);
  const privacy = next.documents.find((document) => document.kind === "privacy");

  if (!privacy || privacy.version !== SUCCESSOR.version) {
    throw new Error("Finalized Privacy v1.2 is unavailable.");
  }

  privacy.status = "Effective";
  privacy.effectiveDate = activationDate;
  next.effectiveDate = activationDate;
  next.effectiveDateDisplay = formatDateDisplay(activationDate);
  next.activationDatePolicy =
    "The current document set may contain different Effective dates. Rulebook v3.0 and PPA v3.0 retain 18 August 2026, Terms v1.1 retains 20 August 2026, and Privacy v1.2 uses its actual controlled Production publication date.";

  return next;
}

export function buildFinalPrivacyRelease({ activationDate, pdfBytes }) {
  assertCalendarDate(activationDate);
  return {
    schemaVersion: 1,
    status: "Final",
    effectiveDate: activationDate,
    effectiveDateDisplay: formatDateDisplay(activationDate),
    documents: [
      {
        effectiveDate: activationDate,
        filename: SUCCESSOR.filename,
        kind: SUCCESSOR.kind,
        publicPath: SUCCESSOR.publicPath,
        sha256: hashBytes(pdfBytes),
        version: SUCCESSOR.version,
      },
    ],
  };
}

export function formatDateDisplay(value) {
  assertCalendarDate(value);
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function getSydneyDate(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SYDNEY_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildReviewCandidateManifest({ pdfBytes, sourceBytes }) {
  return {
    schemaVersion: 1,
    status: "Review Draft - Not Effective",
    runtimeActivated: false,
    effectiveDate: null,
    effectiveDateDisplay: "TBD",
    preparedAgainstRuntime: {
      termsVersion: "1.1",
      privacyVersion: "1.1",
    },
    source: {
      path: "content/legal-privacy-successor-v1.2.json",
      version: "1.2",
      sha256: hashReviewSourceBytes(sourceBytes),
    },
    document: {
      kind: SUCCESSOR.kind,
      version: SUCCESSOR.version,
      filename: SUCCESSOR.filename,
      publicPath: SUCCESSOR.publicPath,
      sha256: hashBytes(pdfBytes),
      size: pdfBytes.length,
    },
    activationRequirements: [
      "owner-authorized final legal review",
      "actual Australia/Sydney Production effective date",
      "immutable artifact finalization and deployment",
      "runtime corpus and release-pair activation",
      "database legal-document activation",
      "renewed Terms acceptance and Privacy acknowledgement where required",
    ],
  };
}

export function assertCurrentRuntimeCorpus(corpus) {
  if (
    !corpus ||
    corpus.schemaVersion !== 1 ||
    !Array.isArray(corpus.documents) ||
    corpus.documents.length !== 4
  ) {
    throw new Error("The current legal corpus is unavailable.");
  }
  if (
    corpus.effectiveDate !== "2026-08-20" ||
    corpus.effectiveDateDisplay !== "20 August 2026"
  ) {
    throw new Error("The current legal corpus publication identity has changed.");
  }
  for (const [kind, expected] of Object.entries(CURRENT_RUNTIME_DOCUMENTS)) {
    const document = corpus.documents.find((candidate) => candidate.kind === kind);
    if (
      !document ||
      document.version !== expected.version ||
      document.status !== "Effective" ||
      document.effectiveDate !== expected.effectiveDate ||
      document.filename !== expected.filename ||
      document.publicPath !== `/documents-rules-ppa/${expected.filename}`
    ) {
      throw new Error(
        `Expected current Effective ${kind} v${expected.version}.`
      );
    }
  }
}

export function assertCurrentRuntimeRelease(release) {
  if (
    !release ||
    release.schemaVersion !== 1 ||
    release.status !== "Final" ||
    !Array.isArray(release.documents) ||
    release.documents.length !== 2
  ) {
    throw new Error("The current runtime legal release is unavailable.");
  }
  if (
    release.effectiveDate !== "2026-08-20" ||
    release.effectiveDateDisplay !== "20 August 2026"
  ) {
    throw new Error("The current runtime legal release date has changed.");
  }
  for (const kind of ["terms", "privacy"]) {
    const expected = CURRENT_RUNTIME_DOCUMENTS[kind];
    const document = release.documents.find((candidate) => candidate.kind === kind);
    if (
      !document ||
      document.version !== expected.version ||
      document.effectiveDate !== expected.effectiveDate ||
      document.filename !== expected.filename ||
      document.publicPath !== `/documents-rules-ppa/${expected.filename}` ||
      document.sha256 !== LOCKED_PUBLISHED_ARTIFACTS[expected.filename]
    ) {
      throw new Error(
        `Expected finalized runtime ${kind} v${expected.version}.`
      );
    }
  }
}

function assertReviewDraft(draft) {
  if (
    !draft ||
    draft.schemaVersion !== 1 ||
    draft.status !== "Review Draft" ||
    draft.effectiveDateToken !== "{{PRODUCTION_EFFECTIVE_DATE}}" ||
    !Array.isArray(draft.documents) ||
    draft.documents.length !== 1
  ) {
    throw new Error("The Privacy v1.2 Review Draft is invalid.");
  }
  const successor = draft.documents[0];
  for (const [key, value] of Object.entries(SUCCESSOR)) {
    if (successor[key] !== value) {
      throw new Error(`The Privacy v1.2 ${key} is invalid.`);
    }
  }
  if (!Array.isArray(successor.operations) || successor.operations.length === 0) {
    throw new Error("The Privacy v1.2 Review Draft has no operations.");
  }
  if (DISALLOWED_DASHES.test(JSON.stringify(draft))) {
    throw new Error("The Privacy v1.2 Review Draft contains a disallowed dash.");
  }
}

function applyOperation(document, operation) {
  const section = document.sections.find(
    (candidate) => candidate.number === operation.sectionNumber
  );
  if (!section) {
    throw new Error(`Privacy section ${operation.sectionNumber} is unavailable.`);
  }

  if (operation.op === "replace-paragraph") {
    const matches = section.blocks.filter(
      (block) => block.type === "paragraph" && block.text === operation.expected
    );
    if (matches.length !== 1) {
      throw new Error(`Expected one paragraph match in Privacy section ${section.number}.`);
    }
    matches[0].text = operation.replacement;
    return;
  }

  if (operation.op === "insert-after-paragraph") {
    const index = uniqueBlockIndex(
      section.blocks,
      (block) => block.type === "paragraph" && block.text === operation.expected,
      `Privacy section ${section.number} paragraph`
    );
    section.blocks.splice(index + 1, 0, ...structuredClone(operation.blocks));
    return;
  }

  if (operation.op === "insert-list-item-after") {
    const match = uniqueListItem(section.blocks, operation.expected, section.number);
    match.block.items.splice(match.index + 1, 0, operation.item);
    return;
  }

  if (operation.op === "insert-table-row-after") {
    const matches = [];
    for (const block of section.blocks) {
      if (block.type !== "table") continue;
      const index = block.rows.findIndex(
        (row) => row[0] === operation.expectedFirstCell
      );
      if (index >= 0) matches.push({ block, index });
    }
    if (matches.length !== 1) {
      throw new Error(`Expected one table-row match in Privacy section ${section.number}.`);
    }
    matches[0].block.rows.splice(matches[0].index + 1, 0, operation.row);
    return;
  }

  throw new Error(`Unsupported Privacy successor operation: ${operation.op}`);
}

function uniqueBlockIndex(blocks, predicate, label) {
  const matches = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => predicate(block));
  if (matches.length !== 1) throw new Error(`Expected one ${label} match.`);
  return matches[0].index;
}

function uniqueListItem(blocks, expected, sectionNumber) {
  const matches = [];
  for (const block of blocks) {
    if (block.type !== "bullets" && block.type !== "numbered") continue;
    block.items.forEach((item, index) => {
      if (item === expected) matches.push({ block, index });
    });
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one list-item match in Privacy section ${sectionNumber}.`);
  }
  return matches[0];
}

function assertLockedPublishedArtifacts() {
  for (const [filename, expectedHash] of Object.entries(
    LOCKED_PUBLISHED_ARTIFACTS
  )) {
    const path = join(PUBLIC_DIRECTORY, filename);
    if (!existsSync(path) || hashBytes(readFileSync(path)) !== expectedHash) {
      throw new Error(`Published legal artifact changed or is missing: ${filename}`);
    }
  }
}

function runGenerator(
  corpusPath,
  outputDirectory,
  { activationDate = null, reviewDraft = false }
) {
  const command = process.platform === "win32" ? "python" : "python3";
  const arguments_ = [
    GENERATOR_PATH,
    "--corpus",
    corpusPath,
    "--output-dir",
    outputDirectory,
    "--kinds",
    "privacy",
  ];
  if (reviewDraft) {
    arguments_.push("--review-draft");
  } else {
    assertCalendarDate(activationDate);
    arguments_.push("--effective-date", activationDate);
  }
  const result = spawnSync(
    command,
    arguments_,
    { cwd: process.cwd(), encoding: "utf8", shell: false }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "PDF generation failed").trim());
  }
}

function writeOnceOrVerify(path, bytes) {
  if (existsSync(path)) {
    if (!readFileSync(path).equals(Buffer.from(bytes))) {
      throw new Error(`Refusing to overwrite a different immutable artifact: ${path}`);
    }
    return "verified";
  }
  writeFileSync(path, bytes, { flag: "wx" });
  return "created";
}

function prepareReviewDraft() {
  const corpusSource = readFileSync(CORPUS_PATH, "utf8");
  const releaseSource = readFileSync(RUNTIME_RELEASE_PATH, "utf8");
  const sourceBytes = readFileSync(DRAFT_PATH);
  const corpus = JSON.parse(corpusSource);
  const release = JSON.parse(releaseSource);
  const draft = JSON.parse(sourceBytes.toString("utf8"));

  assertCurrentRuntimeCorpus(corpus);
  assertCurrentRuntimeRelease(release);
  assertLockedPublishedArtifacts();
  const stagedCorpus = applyPrivacySuccessorDraft(corpus, draft);
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "ironclad-privacy-v1.2-review-")
  );
  const stagedCorpusPath = join(temporaryDirectory, "legal-corpus.json");
  const stagedOutputDirectory = join(temporaryDirectory, "pdfs");

  try {
    writeFileSync(stagedCorpusPath, `${JSON.stringify(stagedCorpus, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    runGenerator(stagedCorpusPath, stagedOutputDirectory, {
      reviewDraft: true,
    });
    const stagedPdfPath = join(stagedOutputDirectory, SUCCESSOR.filename);
    if (!existsSync(stagedPdfPath)) {
      throw new Error("The generator did not create the Privacy v1.2 review draft.");
    }
    const pdfBytes = readFileSync(stagedPdfPath);
    assertReviewPdfEnvelope(pdfBytes);
    const manifest = buildReviewCandidateManifest({ pdfBytes, sourceBytes });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const targetPdfPath = join(PUBLIC_DIRECTORY, SUCCESSOR.filename);
    const pdfResult = writeOnceOrVerify(targetPdfPath, pdfBytes);
    const manifestResult = writeOnceOrVerify(CANDIDATE_PATH, manifestBytes);

    if (
      readFileSync(CORPUS_PATH, "utf8") !== corpusSource ||
      readFileSync(RUNTIME_RELEASE_PATH, "utf8") !== releaseSource
    ) {
      throw new Error("Runtime legal state changed during draft preparation.");
    }
    console.log(
      JSON.stringify(
        {
          status: "REVIEW DRAFT - NOT EFFECTIVE",
          effectiveDate: "TBD",
          runtimeActivated: false,
          pdf: {
            filename: SUCCESSOR.filename,
            result: pdfResult,
            sha256: manifest.document.sha256,
            size: manifest.document.size,
          },
          candidateManifest: manifestResult,
        },
        null,
        2
      )
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function assertCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) {
    throw new Error("Activation date must use YYYY-MM-DD.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Activation date is not a valid calendar date.");
  }
}

function assertCleanWorktree() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: process.cwd(), encoding: "utf8", shell: false }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || "git status failed").trim());
  }
  if (result.stdout.trim()) {
    throw new Error("The Privacy v1.2 finalization worktree must be clean.");
  }
}

function assertReviewCandidate(candidate, sourceBytes, pdfBytes) {
  const expected = buildReviewCandidateManifest({ pdfBytes, sourceBytes });
  if (JSON.stringify(candidate) !== JSON.stringify(expected)) {
    throw new Error("The Privacy v1.2 review candidate no longer matches its source and PDF.");
  }
  assertReviewPdfEnvelope(pdfBytes);
}

function assertFinalPdfEnvelope(bytes, activationDate) {
  const pdfBytes = Buffer.from(bytes);
  const source = pdfBytes.toString("latin1");
  const displayDate = formatDateDisplay(activationDate);
  if (
    pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-" ||
    !source.includes(`Effective ${displayDate}`) ||
    source.includes("REVIEW DRAFT - NOT EFFECTIVE") ||
    source.includes("Effective date: TBD")
  ) {
    throw new Error("Generated Privacy v1.2 PDF is not a final Effective artifact.");
  }
}

function finalizeRuntime(activationDate) {
  assertCalendarDate(activationDate);
  const today = getSydneyDate(new Date());
  if (activationDate !== today) {
    throw new Error(
      `Activation date ${activationDate} is not today's Australia/Sydney date (${today}).`
    );
  }

  assertCleanWorktree();
  assertLockedPublishedArtifacts();

  const corpusSource = readFileSync(CORPUS_PATH, "utf8");
  const releaseSource = readFileSync(RUNTIME_RELEASE_PATH, "utf8");
  const candidateSource = readFileSync(CANDIDATE_PATH, "utf8");
  const sourceBytes = readFileSync(DRAFT_PATH);
  const targetPdfPath = join(PUBLIC_DIRECTORY, SUCCESSOR.filename);
  const reviewPdfBytes = readFileSync(targetPdfPath);
  const corpus = JSON.parse(corpusSource);
  const release = JSON.parse(releaseSource);
  const candidate = JSON.parse(candidateSource);
  const draft = JSON.parse(sourceBytes.toString("utf8"));

  assertCurrentRuntimeCorpus(corpus);
  assertCurrentRuntimeRelease(release);
  assertReviewCandidate(candidate, sourceBytes, reviewPdfBytes);

  const finalizedCorpus = finalizePrivacySuccessor(
    corpus,
    draft,
    activationDate
  );
  const serializedCorpus = `${JSON.stringify(finalizedCorpus, null, 2)}\n`;
  if (/\{\{PRODUCTION_EFFECTIVE_DATE\}\}|Review Draft|Not Effective/.test(serializedCorpus)) {
    throw new Error("The finalized Privacy v1.2 corpus contains a draft marker.");
  }

  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "ironclad-privacy-v1.2-final-")
  );
  const stagedCorpusPath = join(temporaryDirectory, "legal-corpus.json");
  const stagedOutputDirectory = join(temporaryDirectory, "pdfs");

  try {
    writeFileSync(stagedCorpusPath, serializedCorpus, "utf8");
    runGenerator(stagedCorpusPath, stagedOutputDirectory, { activationDate });

    const stagedPdfPath = join(stagedOutputDirectory, SUCCESSOR.filename);
    if (!existsSync(stagedPdfPath)) {
      throw new Error("The generator did not create final Privacy v1.2.");
    }
    const finalPdfBytes = readFileSync(stagedPdfPath);
    assertFinalPdfEnvelope(finalPdfBytes, activationDate);
    const manifest = buildFinalPrivacyRelease({
      activationDate,
      pdfBytes: finalPdfBytes,
    });
    validateFinalPrivacyRelease({
      activationDate,
      baseUrl: PRODUCTION_ORIGIN,
      corpus: finalizedCorpus,
      release: manifest,
    });

    writeFileSync(CORPUS_PATH, serializedCorpus, "utf8");
    writeFileSync(targetPdfPath, finalPdfBytes);
    writeFileSync(
      RUNTIME_RELEASE_PATH,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    rmSync(CANDIDATE_PATH);

    assertLockedPublishedArtifacts();
    if (hashBytes(readFileSync(targetPdfPath)) !== manifest.documents[0].sha256) {
      throw new Error("Final Privacy v1.2 PDF hash verification failed.");
    }
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    writeFileSync(CORPUS_PATH, corpusSource, "utf8");
    writeFileSync(RUNTIME_RELEASE_PATH, releaseSource, "utf8");
    writeFileSync(CANDIDATE_PATH, candidateSource, "utf8");
    writeFileSync(targetPdfPath, reviewPdfBytes);
    throw error;
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) return { activationDate: null };
  if (arguments_.length === 2 && arguments_[0] === "--activation-date") {
    return { activationDate: arguments_[1] };
  }
  throw new Error(
    "Use no arguments for review verification or --activation-date YYYY-MM-DD for finalization."
  );
}

function main() {
  const { activationDate } = parseArguments(process.argv.slice(2));
  if (activationDate) {
    finalizeRuntime(activationDate);
    return;
  }
  prepareReviewDraft();
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertReviewPdfEnvelope(bytes) {
  const pdfBytes = Buffer.from(bytes);
  const source = pdfBytes.toString("latin1");
  if (
    pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-" ||
    !source.includes("REVIEW DRAFT - NOT EFFECTIVE") ||
    !source.includes("Effective date: TBD") ||
    source.includes("Effective 20 August 2026")
  ) {
    throw new Error("Generated Privacy v1.2 PDF is not a safe review draft.");
  }
}

export function hashReviewSourceBytes(bytes) {
  const normalized = Buffer.from(
    Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n").replaceAll("\r", "\n"),
    "utf8"
  );
  return hashBytes(normalized);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(
      `Privacy v1.2 publication command failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}

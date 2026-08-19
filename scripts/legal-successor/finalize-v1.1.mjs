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

const SYDNEY_TIME_ZONE = "Australia/Sydney";
const CORPUS_PATH = resolve("content/legal-corpus.json");
const DRAFT_PATH = resolve("content/legal-successors-v1.1.json");
const RELEASE_MANIFEST_PATH = resolve("content/legal-successor-release.json");
const PUBLIC_DIRECTORY = resolve("public/documents-rules-ppa");
const GENERATOR_PATH = resolve("scripts/generate-legal-pdfs.py");
const SUCCESSORS = Object.freeze({
  privacy: Object.freeze({
    filename: "ironclad-privacy-policy-v1.1.pdf",
    fromVersion: "1.0",
    publicPath: "/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf",
    version: "1.1",
  }),
  terms: Object.freeze({
    filename: "ironclad-terms-of-service-v1.1.pdf",
    fromVersion: "1.0",
    publicPath: "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
    version: "1.1",
  }),
});

const LOCKED_HISTORICAL_ARTIFACTS = Object.freeze({
  "ironclad-official-tournament-rulebook-v3.0.pdf":
    "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
  "ironclad-player-participation-agreement-v3.0.pdf":
    "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
  "ironclad-terms-of-service-v1.0.pdf":
    "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
  "ironclad-privacy-policy-v1.0.pdf":
    "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
});

export function applySuccessorDraft(corpus, draft, activationDate) {
  assertCalendarDate(activationDate);
  assertReviewDraft(draft);

  if (!corpus || corpus.schemaVersion !== 1 || !Array.isArray(corpus.documents)) {
    throw new Error("The current legal corpus is unavailable.");
  }
  if (corpus.documents.length !== 4) {
    throw new Error("The current legal corpus must contain exactly four documents.");
  }

  const next = structuredClone(corpus);
  const unchangedBefore = new Map(
    next.documents
      .filter((document) => document.kind === "rulebook" || document.kind === "ppa")
      .map((document) => [document.kind, JSON.stringify(document)])
  );

  for (const successor of draft.documents) {
    const document = next.documents.find(
      (candidate) => candidate.kind === successor.kind
    );
    if (!document || document.version !== successor.fromVersion) {
      throw new Error(
        `Expected current ${successor.kind} v${successor.fromVersion}.`
      );
    }
    if (document.status !== "Effective") {
      throw new Error(`Current ${successor.kind} is not Effective.`);
    }

    document.version = successor.version;
    document.filename = successor.filename;
    document.publicPath = successor.publicPath;
    document.effectiveDate = activationDate;

    for (const operation of successor.operations) {
      applyOperation(document, operation);
    }
  }

  for (const [kind, serialized] of unchangedBefore) {
    const document = next.documents.find((candidate) => candidate.kind === kind);
    if (JSON.stringify(document) !== serialized) {
      throw new Error(`${kind} changed during successor finalization.`);
    }
  }

  next.effectiveDate = activationDate;
  next.effectiveDateDisplay = formatDateDisplay(activationDate);
  next.activationDatePolicy =
    "The current document set may contain different Effective dates. Rulebook v3.0 and PPA v3.0 retain their original immutable dates. Terms v1.1 and Privacy v1.1 use their actual controlled Production publication date and must be regenerated before activation if that Australia/Sydney date changes.";

  return next;
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

function applyOperation(document, operation) {
  const section = document.sections.find(
    (candidate) => candidate.number === operation.sectionNumber
  );
  if (!section) {
    throw new Error(
      `${document.kind} section ${operation.sectionNumber} is unavailable.`
    );
  }

  if (operation.op === "replace-paragraph") {
    const matches = section.blocks.filter(
      (block) => block.type === "paragraph" && block.text === operation.expected
    );
    if (matches.length !== 1) {
      throw new Error(`Expected one paragraph match in ${document.kind} section ${section.number}.`);
    }
    matches[0].text = operation.replacement;
    return;
  }

  if (operation.op === "insert-after-paragraph") {
    const index = uniqueBlockIndex(
      section.blocks,
      (block) => block.type === "paragraph" && block.text === operation.expected,
      `${document.kind} section ${section.number} paragraph`
    );
    section.blocks.splice(index + 1, 0, ...structuredClone(operation.blocks));
    return;
  }

  if (operation.op === "replace-list-item") {
    const match = uniqueListItem(section.blocks, operation.expected, document.kind, section.number);
    match.block.items[match.index] = operation.replacement;
    return;
  }

  if (operation.op === "insert-list-item-after") {
    const match = uniqueListItem(section.blocks, operation.expected, document.kind, section.number);
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
      throw new Error(`Expected one table-row match in ${document.kind} section ${section.number}.`);
    }
    matches[0].block.rows.splice(matches[0].index + 1, 0, operation.row);
    return;
  }

  throw new Error(`Unsupported successor operation: ${operation.op}`);
}

function uniqueBlockIndex(blocks, predicate, label) {
  const matches = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => predicate(block));
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label} match.`);
  }
  return matches[0].index;
}

function uniqueListItem(blocks, expected, kind, sectionNumber) {
  const matches = [];
  for (const block of blocks) {
    if (block.type !== "bullets" && block.type !== "numbered") continue;
    block.items.forEach((item, index) => {
      if (item === expected) matches.push({ block, index });
    });
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one list-item match in ${kind} section ${sectionNumber}.`);
  }
  return matches[0];
}

function assertReviewDraft(draft) {
  if (
    !draft ||
    draft.schemaVersion !== 1 ||
    draft.status !== "Review Draft" ||
    draft.effectiveDateToken !== "{{PRODUCTION_EFFECTIVE_DATE}}" ||
    !Array.isArray(draft.documents) ||
    draft.documents.length !== 2
  ) {
    throw new Error("The Terms/Privacy v1.1 Review Draft is invalid.");
  }
  const kinds = draft.documents.map((document) => document.kind).sort();
  if (JSON.stringify(kinds) !== JSON.stringify(["privacy", "terms"])) {
    throw new Error("The Review Draft must contain only Terms and Privacy successors.");
  }
  for (const successor of draft.documents) {
    const expected = SUCCESSORS[successor.kind];
    if (
      !expected ||
      successor.fromVersion !== expected.fromVersion ||
      successor.version !== expected.version ||
      successor.filename !== expected.filename ||
      successor.publicPath !== expected.publicPath ||
      !Array.isArray(successor.operations) ||
      successor.operations.length === 0
    ) {
      throw new Error(`The ${successor.kind} Review Draft identity is invalid.`);
    }
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertLockedHistoricalArtifacts() {
  for (const [filename, expectedHash] of Object.entries(
    LOCKED_HISTORICAL_ARTIFACTS
  )) {
    const path = join(PUBLIC_DIRECTORY, filename);
    if (!existsSync(path) || sha256(path) !== expectedHash) {
      throw new Error(`Historical artifact changed or is missing: ${filename}`);
    }
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
    throw new Error("The finalization worktree must be clean.");
  }
}

function runGenerator(corpusPath, outputDirectory, activationDate) {
  const command = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(
    command,
    [
      GENERATOR_PATH,
      "--corpus",
      corpusPath,
      "--output-dir",
      outputDirectory,
      "--effective-date",
      activationDate,
      "--kinds",
      "terms,privacy",
    ],
    { cwd: process.cwd(), encoding: "utf8", shell: false }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "PDF generation failed").trim());
  }
}

function parseArguments(arguments_) {
  let activationDate = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--activation-date") {
      activationDate = arguments_[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { activationDate };
}

function main() {
  const { activationDate } = parseArguments(process.argv.slice(2));
  assertCalendarDate(activationDate);
  const today = getSydneyDate(new Date());
  if (activationDate !== today) {
    throw new Error(
      `Activation date ${activationDate} is not today's Australia/Sydney date (${today}).`
    );
  }
  assertCleanWorktree();
  assertLockedHistoricalArtifacts();
  if (existsSync(RELEASE_MANIFEST_PATH)) {
    throw new Error("A finalized legal-successor manifest already exists.");
  }

  const corpusSource = readFileSync(CORPUS_PATH, "utf8");
  const corpus = JSON.parse(corpusSource);
  const draft = JSON.parse(readFileSync(DRAFT_PATH, "utf8"));
  const finalizedCorpus = applySuccessorDraft(corpus, draft, activationDate);
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "ironclad-legal-v1.1-"));
  const stagedCorpusPath = join(temporaryDirectory, "legal-corpus.json");
  const stagedOutputDirectory = join(temporaryDirectory, "pdfs");
  const serializedCorpus = `${JSON.stringify(finalizedCorpus, null, 2)}\n`;
  if (/\{\{PRODUCTION_EFFECTIVE_DATE\}\}|Review Draft|Not Effective/.test(serializedCorpus)) {
    throw new Error("The finalized corpus still contains a Review-Draft marker.");
  }

  try {
    writeFileSync(stagedCorpusPath, serializedCorpus, "utf8");
    runGenerator(stagedCorpusPath, stagedOutputDirectory, activationDate);

    const releases = draft.documents.map((successor) => {
      const stagedPath = join(stagedOutputDirectory, successor.filename);
      const targetPath = join(PUBLIC_DIRECTORY, successor.filename);
      if (!existsSync(stagedPath)) {
        throw new Error(`Generator did not create ${successor.filename}.`);
      }
      if (existsSync(targetPath)) {
        throw new Error(`Refusing to overwrite ${successor.filename}.`);
      }
      return {
        kind: successor.kind,
        version: successor.version,
        filename: successor.filename,
        publicPath: successor.publicPath,
        effectiveDate: activationDate,
        sha256: sha256(stagedPath),
        stagedPath,
        targetPath,
      };
    });

    const manifest = {
      schemaVersion: 1,
      status: "Final",
      effectiveDate: activationDate,
      effectiveDateDisplay: formatDateDisplay(activationDate),
      documents: releases.map((release) => ({
        effectiveDate: release.effectiveDate,
        filename: release.filename,
        kind: release.kind,
        publicPath: release.publicPath,
        sha256: release.sha256,
        version: release.version,
      })),
    };

    writeFileSync(CORPUS_PATH, serializedCorpus, "utf8");
    for (const release of releases) {
      writeFileSync(release.targetPath, readFileSync(release.stagedPath), {
        flag: "wx",
      });
    }
    writeFileSync(
      RELEASE_MANIFEST_PATH,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
    assertLockedHistoricalArtifacts();
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    for (const successor of draft.documents) {
      rmSync(join(PUBLIC_DIRECTORY, successor.filename), { force: true });
    }
    rmSync(RELEASE_MANIFEST_PATH, { force: true });
    writeFileSync(CORPUS_PATH, corpusSource, "utf8");
    throw error;
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(
      `Legal successor finalization failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}

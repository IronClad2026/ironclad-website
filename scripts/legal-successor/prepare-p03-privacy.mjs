#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { assertPdfEffectiveDate } from "../phase15c/release-artifact-contract.mjs";

export const SOURCE = "content/legal-privacy-successor-v1.3.json";
export const REVIEW_DIRECTORY = "docs/legal-drafts/p03-privacy-v1.3";
const CORPUS = "content/legal-corpus.json";
const RELEASE = "content/legal-successor-release.json";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const textHash = (bytes) => sha256(Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8"));
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

export function applyP03PrivacyDraft(corpus, draft) {
  const previous = corpus?.documents?.find((document) => document.kind === "privacy");
  const successor = draft?.documents?.[0];
  if (corpus.schemaVersion !== 1 || corpus.documents.length !== 4
    || previous?.version !== "1.2" || previous.status !== "Effective"
    || draft.schemaVersion !== 1 || draft.status !== "Review Draft"
    || draft.documents.length !== 1 || successor?.kind !== "privacy"
    || successor.fromVersion !== "1.2" || successor.version !== "1.3"
    || successor.filename !== "ironclad-privacy-policy-v1.3.pdf"
    || successor.publicPath !== "/documents-rules-ppa/ironclad-privacy-policy-v1.3.pdf"
    || !successor.operations?.length) throw new Error("Unexpected Privacy v1.3 predecessor or draft contract.");
  const next = structuredClone(corpus);
  const document = next.documents.find((entry) => entry.kind === "privacy");
  Object.assign(document, { version: successor.version, filename: successor.filename,
    publicPath: successor.publicPath, status: "Review Draft", effectiveDate: null });
  for (const operation of successor.operations) {
    const section = document.sections.find((entry) => entry.number === operation.sectionNumber);
    if (!section) throw new Error("Missing successor section.");
    if (operation.op === "insert-table-row-after") {
      const matches = section.blocks.flatMap((block) => block.type === "table"
        ? block.rows.flatMap((row, index) => row[0] === operation.expectedFirstCell ? [{ block, index }] : []) : []);
      if (matches.length !== 1) throw new Error("Ambiguous or missing retention row anchor.");
      matches[0].block.rows.splice(matches[0].index + 1, 0, structuredClone(operation.row));
    } else {
      const matches = section.blocks.flatMap((block, index) => block.type === "paragraph"
        && block.text === operation.expected ? [index] : []);
      if (matches.length !== 1) throw new Error("Ambiguous or missing successor paragraph anchor.");
      if (operation.op === "replace-paragraph") section.blocks[matches[0]].text = operation.replacement;
      else if (operation.op === "insert-after-paragraph") section.blocks.splice(matches[0] + 1, 0, ...structuredClone(operation.blocks));
      else throw new Error("Unsupported successor operation.");
    }
  }
  return next;
}

export function finalizeP03PrivacyCorpus(corpus, draft, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Invalid publication date.");
  const next = applyP03PrivacyDraft(corpus, draft);
  const display = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date));
  Object.assign(next.documents.find((entry) => entry.kind === "privacy"), { status: "Effective", effectiveDate: date });
  Object.assign(next, { effectiveDate: date, effectiveDateDisplay: display,
    activationDatePolicy: "Every unchanged document keeps its existing Effective date. Privacy v1.3 uses its actual controlled Australia/Sydney publication date." });
  return next;
}

export function buildP03PrivacyRelease(corpus, stagedCorpus, pdfBytes, repository = process.cwd()) {
  const privacy = stagedCorpus.documents.find((entry) => entry.kind === "privacy");
  if (privacy?.status !== "Effective" || privacy.version !== "1.3") throw new Error("Draft cannot become a Final release manifest.");
  assertPdfEffectiveDate(pdfBytes, stagedCorpus.effectiveDateDisplay, "privacy");
  return { schemaVersion: 1, status: "Final", effectiveDate: privacy.effectiveDate,
    effectiveDateDisplay: stagedCorpus.effectiveDateDisplay,
    predecessorDocuments: corpus.documents.filter((entry) => ["terms", "privacy"].includes(entry.kind)).map((entry) => ({
      kind: entry.kind, version: entry.version, effectiveDate: entry.effectiveDate,
      filename: entry.filename, publicPath: entry.publicPath,
      sha256: sha256(readFileSync(join(repository, "public", entry.publicPath))),
    })),
    documents: [{kind: "privacy", version: "1.3", effectiveDate: privacy.effectiveDate,
      filename: privacy.filename, publicPath: privacy.publicPath, sha256: sha256(pdfBytes)}],
  };
}

export function prepareP03Privacy({ outputDirectory = REVIEW_DIRECTORY, activationDate = null, python = process.platform === "win32" ? "python" : "python3" } = {}) {
  const before = new Map([CORPUS, RELEASE].map((file) => [file, readFileSync(file)]));
  const corpus = json(join(REVIEW_DIRECTORY, "predecessor-corpus.json"));
  const draft = json(SOURCE);
  const staged = activationDate ? finalizeP03PrivacyCorpus(corpus, draft, activationDate) : applyP03PrivacyDraft(corpus, draft);
  const directory = resolve(outputDirectory);
  for (const protectedDirectory of ["public", "content"]) {
    const target = resolve(protectedDirectory);
    if (directory === target || directory.startsWith(target + (process.platform === "win32" ? "\\" : "/"))) throw new Error("Preparation cannot target live publication directories.");
  }
  mkdirSync(directory, { recursive: true });
  const stagedPath = join(directory, "legal-corpus.json");
  writeFileSync(stagedPath, JSON.stringify(staged, null, 2) + "\n");
  const args = ["scripts/generate-legal-pdfs.py", "--corpus", stagedPath, "--output-dir", directory, "--kinds", "privacy"];
  args.push(...(activationDate ? ["--effective-date", activationDate] : ["--review-draft"]));
  const generated = spawnSync(python, args, { encoding: "utf8", shell: false });
  if (generated.error || generated.status !== 0) throw new Error(generated.error?.message ?? generated.stderr ?? "PDF generation failed.");
  const pdf = readFileSync(join(directory, "ironclad-privacy-policy-v1.3.pdf"));
  const manifest = activationDate ? buildP03PrivacyRelease(corpus, staged, pdf) : {
    schemaVersion: 1, status: "Review Draft", effectiveDate: null,
    source: { path: SOURCE, sha256: textHash(readFileSync(SOURCE)), encoding: "utf8-lf" },
    corpusSha256: textHash(readFileSync(stagedPath)), pdfSha256: sha256(pdf), textHashEncoding: "utf8-lf",
    predecessorCorpusSha256: textHash(readFileSync(join(REVIEW_DIRECTORY, "predecessor-corpus.json"))), predecessorReleaseSha256: textHash(readFileSync(join(REVIEW_DIRECTORY, "predecessor-release.json"))),
    publicationRule: draft.publicationRule,
  };
  writeFileSync(join(directory, activationDate ? "legal-successor-release.json" : "review-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const [file, bytes] of before) if (!readFileSync(file).equals(bytes)) throw new Error("Preparation changed runtime legal state.");
  return { status: manifest.status, outputDirectory: directory, pdfSha256: sha256(pdf) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!["--output-dir", "--activation-date", "--python"].includes(key) || !args[index + 1]) throw new Error("Unknown or incomplete preparation option.");
    options[key === "--output-dir" ? "outputDirectory" : key === "--python" ? "python" : "activationDate"] = args[index + 1];
  }
  if (options.activationDate && (!options.outputDirectory || existsSync(resolve(options.outputDirectory)))) throw new Error("Final staging requires a fresh explicit output directory; no publication occurs.");
  console.log(JSON.stringify(prepareP03Privacy(options)));
}

#!/usr/bin/env node

// Local candidate staging only. No Git commit, push, deployment or DB connection.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { finalizeP03PrivacyCorpus } from "./prepare-p03-privacy.mjs";
import { validateP03PrivacyPublication } from "./p03-privacy-publication.mjs";
import { validateP03LegalRuntime, P03_LEGAL_PREDECESSOR_CORPUS } from "./p03-legal-runtime.mjs";

export function stageP03PrivacyPackage(directory, expectedHead) {
  const git = (args) => execFileSync("git", args, {encoding:"utf8"}).trim();
  if (!/^[a-f0-9]{40}$/.test(expectedHead) || git(["rev-parse","HEAD"]) !== expectedHead) throw new Error("Exact candidate HEAD is required.");
  if (git(["branch","--show-current"]) !== "codex/p03-production-ready" || git(["status","--porcelain=v1"])) throw new Error("Stage only in the clean isolated P03 feature branch.");
  if (validateP03LegalRuntime(process.cwd()).mode !== "prepared-review") throw new Error("Runtime is no longer the exact predecessor; inspect before retrying.");
  const read = (file) => JSON.parse(readFileSync(file,"utf8"));
  const predecessor = read(P03_LEGAL_PREDECESSOR_CORPUS);
  const corpus = read(path.join(directory,"legal-corpus.json"));
  const release = read(path.join(directory,"legal-successor-release.json"));
  const pdfBytes = readFileSync(path.join(directory,"ironclad-privacy-policy-v1.3.pdf"));
  const checked = validateP03PrivacyPublication({predecessor, corpus, release, pdfBytes});
  const date = new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Sydney",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if (checked.date !== date || !isDeepStrictEqual(corpus,finalizeP03PrivacyCorpus(predecessor,read("content/legal-privacy-successor-v1.3.json"),date))) throw new Error("Package is not the exact approved successor for today's Sydney publication date.");
  const pdfPath="public/documents-rules-ppa/ironclad-privacy-policy-v1.3.pdf";
  if (existsSync(pdfPath)) throw new Error("Refusing to overwrite a published or staged immutable artifact.");
  const journal=path.join("p03-artifacts",`legal-stage-${Date.now()}.json`);
  mkdirSync(path.dirname(journal),{recursive:true});
  writeFileSync(journal,JSON.stringify({status:"INTENT",expectedHead,publicationDate:date,files:[pdfPath,"content/legal-corpus.json","content/legal-successor-release.json"]},null,2)+"\n",{flag:"wx"});
  writeFileSync(pdfPath,pdfBytes,{flag:"wx"});
  writeFileSync("content/legal-corpus.json",JSON.stringify(corpus,null,2)+"\n");
  writeFileSync("content/legal-successor-release.json",JSON.stringify(release,null,2)+"\n");
  const result=validateP03LegalRuntime(process.cwd());
  writeFileSync(journal,JSON.stringify({status:"STAGED; NOT PUBLISHED",expectedHead,...result},null,2)+"\n");
  return {status:"STAGED; NOT PUBLISHED",...result};
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const {values}=parseArgs({options:{"package-dir":{type:"string"},"expected-head":{type:"string"}}});
  if (!values["package-dir"] || !values["expected-head"]) throw new Error("Provide --package-dir and --expected-head.");
  console.log(JSON.stringify(stageP03PrivacyPackage(path.resolve(values["package-dir"]),values["expected-head"])));
}

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const stagingRef = "zzbnneprhjicmajpjkdg";
export function loadTarget() {
  const evidencePath = process.env.P03_PREVIEW_DEPLOYMENT;
  const candidateSha = process.env.P03_CANDIDATE_SHA;
  if (!evidencePath || !candidateSha || !/^[a-f0-9]{40}$/.test(candidateSha)) {
    throw new Error("Provide P03_PREVIEW_DEPLOYMENT and P03_CANDIDATE_SHA before hosted validation.");
  }
  const evidence = JSON.parse(readFileSync(resolve(evidencePath), "utf8"));
  const deployment = evidence.deployment ?? evidence;
  const previewUrl = `https://${String(deployment.url).replace(/^https:\/\//, "")}`;
  const url = new URL(previewUrl);
  if (!/^ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app$/.test(url.hostname) ||
    url.origin !== previewUrl || deployment.readyState !== "READY" ||
    ![null, "preview"].includes(deployment.target) ||
    deployment.meta?.githubCommitSha !== candidateSha ||
    deployment.meta?.githubCommitRef !== "codex/p03-production-ready" ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== candidateSha) {
    throw new Error("Exact READY candidate Preview identity has not been established.");
  }
  return { candidateSha, previewUrl, supabaseProjectRef: stagingRef };
}

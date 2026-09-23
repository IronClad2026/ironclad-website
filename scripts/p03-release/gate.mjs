import path from "node:path";
import { verifyPackage } from "../p03-db/package.mjs";
import { assessCompetition, assessQuietWindow, canonical, capture, compare, connection, digest, fileHash, invariant, matchRoomIsOff, PRODUCTION_REF, readJson, run, saveJson, STAGING_REF } from "./core.mjs";
import { verifyRestoredBackup } from "./backup.mjs";

export const PRODUCTION_VERCEL_PROJECT = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const SHA = /^[0-9a-f]{40}$/;
const packageSummary = (root) => verifyPackage(root).map(({ file, version, name, sha256 }) => ({ file, version, name, sha256 }));
export const BROWSER_CASES = ["login", "bracket", "completed-match", "current-match", "one-player-tbd", "match-room", "unread-card", "send-read", "notification", "assistance", "result-replay", "admin-workspace", "mobile-375", "mobile-390"];

export function validateBrowserReport(report, config) {
  invariant(report.metadata?.candidateSha === config.candidateSha && report.metadata?.previewUrl === config.previewUrl && report.metadata?.supabaseProjectRef === STAGING_REF, "Browser report candidate/Preview/test database binding differs.");
  invariant(report.stats?.unexpected === 0 && report.stats?.skipped === 0 && report.stats?.flaky === 0 && report.stats?.expected >= BROWSER_CASES.length && report.errors?.length === 0, "Browser report has missing, failed, skipped, or flaky tests.");
  const specs = [];
  function visit(suite) { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child); }
  for (const suite of report.suites ?? []) visit(suite);
  for (const required of BROWSER_CASES) invariant(specs.some((spec) => spec.title.includes(`[p03:${required}]`) && spec.ok === true && spec.tests?.length > 0 && spec.tests.every((test) => test.status === "expected" && test.results?.length > 0 && test.results.every((result) => result.status === "passed"))), `Missing successful browser scenario: ${required}.`);
}

export function seal({ repository, config, output }) {
  const candidateSha = run("git", ["rev-parse", "HEAD"], { cwd: repository });
  invariant(!run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repository }), "Candidate worktree must be clean before sealing.");
  invariant(SHA.test(config.masterSha) && SHA.test(candidateSha), "Full Git SHAs are required.");
  invariant(config.productionProjectRef === PRODUCTION_REF, "Production Supabase project mismatch.");
  invariant(/^[\w.-]+\/[\w.-]+$/.test(config.githubRepository), "GitHub repository must be owner/name.");
  // A Vercel project has separate Preview and Production deployments. Isolation
  // is enforced by the candidate's build guard and verified deployment target,
  // branch, SHA and current Production deployment identity below. The guard
  // rejects Production Supabase, live Clerk, and outbound provider credentials.
  invariant(/^prj_[A-Za-z0-9]+$/.test(config.previewProjectId), "Concrete Preview project ID required.");
  invariant(/^dpl_[A-Za-z0-9]+$/.test(config.previewDeploymentId), "Concrete Preview deployment ID required.");
  invariant(/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(config.previewUrl), "Use the immutable Vercel deployment URL.");
  const ledger = readJson(path.join(repository, "docs/p03-production-ledger.json"));
  invariant(ledger.master === config.masterSha && ledger.projectId === PRODUCTION_REF, "Reviewed ledger baseline does not match release configuration.");
  invariant(config.privacyDecision, "Reviewed transcript retention/purge/account-closure decision artifact required.");
  const result = { schemaVersion: 1, createdAt: new Date().toISOString(), ...config, candidateSha, migrations: packageSummary(repository), expectedLedger: ledger.migrations, dependencyManifestSha256: fileHash(path.join(repository, "scripts/p03-db/dependencies.json")), browserReportSha256: fileHash(config.browserReport), runbookSha256: fileHash(path.join(repository, config.runbook)), privacyDecisionSha256: fileHash(config.privacyDecision), previewGuard: ["lib/p03-preview-safety.ts", "next.config.ts"].map((file) => ({ file, sha256: fileHash(path.join(repository, file)) })) };
  validateBrowserReport(readJson(config.browserReport), result);
  saveJson(output, result);
  return result;
}

async function deployment(config, env) {
  invariant(env.VERCEL_TOKEN, "VERCEL_TOKEN required for read-only deployment verification.");
  const suffix = config.vercelTeamId ? `?teamId=${encodeURIComponent(config.vercelTeamId)}` : "";
  const response = await fetch(`https://api.vercel.com/v13/deployments/${config.previewDeploymentId}${suffix}`, { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(15000) });
  invariant(response.ok, `Vercel read-only verification returned HTTP ${response.status}.`);
  const value = await response.json();
  invariant(value.id === config.previewDeploymentId && value.projectId === config.previewProjectId && (value.target === null || value.target === "preview") && !value.customEnvironment && !value.customEnvironmentSlug && !["PROMOTED", "ROLLING"].includes(value.readySubstate) && value.isRollbackCandidate !== true && value.readyState === "READY" && `https://${value.url}` === config.previewUrl, "Preview is not READY, is a Production/custom deployment, or deployment identity differs.");
  invariant(value.meta?.githubCommitRef === "codex/p03-production-ready", "Preview did not use the branch protected by the candidate build-isolation guard.");
  invariant((value.meta?.githubCommitSha ?? value.gitSource?.sha) === config.candidateSha, "Preview is not built from the exact candidate SHA.");
  const projectResponse = await fetch(`https://api.vercel.com/v9/projects/${config.previewProjectId}${suffix}`, { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(15000) });
  invariant(projectResponse.ok, "Cannot verify current Production deployment identity.");
  const project = await projectResponse.json();
  invariant(project.id === config.previewProjectId && project.targets?.production?.id && project.targets.production.id !== value.id, "Preview is the current Production deployment or Production identity is unavailable.");
  return { id: value.id, url: config.previewUrl, readyState: value.readyState, candidateSha: config.candidateSha };
}

function ci(config, repository) {
  const response = JSON.parse(run("gh", ["api", `repos/${config.githubRepository}/actions/runs?head_sha=${config.candidateSha}&per_page=100`], { cwd: repository }));
  const runs = response.workflow_runs.filter((item) => item.name === "CI" && item.head_sha === config.candidateSha).sort((a, b) => b.id - a.id);
  invariant(runs.length > 0 && runs[0].status === "completed" && runs[0].conclusion === "success", "Latest exact-candidate CI run is not green.");
  const jobs = JSON.parse(run("gh", ["api", `repos/${config.githubRepository}/actions/runs/${runs[0].id}/jobs?per_page=100`], { cwd: repository })).jobs;
  for (const name of ["validate", "p03-database"]) invariant(jobs.some((job) => job.name === name && job.conclusion === "success"), `CI ${name} job has not passed.`);
  invariant(jobs.every((job) => job.conclusion === "success"), "A CI job did not pass.");
  return { runId: runs[0].id, candidateSha: runs[0].head_sha, conclusion: runs[0].conclusion };
}

export async function gate({ repository, sealFile, backupDirectory, output, env = process.env }) {
  const reasons = []; const evidence = {};
  const check = async (name, fn) => { try { evidence[name] = await fn(); } catch (error) { reasons.push(`${name}: ${error.message}`); } };
  let config;
  await check("seal", () => {
    config = readJson(sealFile);
    invariant(config.schemaVersion === 1 && SHA.test(config.masterSha) && SHA.test(config.candidateSha), "Release seal is incomplete.");
    invariant(config.productionProjectRef === PRODUCTION_REF && /^prj_[A-Za-z0-9]+$/.test(config.previewProjectId), "Project identity in release seal is invalid.");
    return { sha256: fileHash(sealFile), candidateSha: config.candidateSha };
  });
  if (reasons.length === 0) {
    await check("git", () => {
      invariant(run("git", ["rev-parse", "HEAD"], { cwd: repository }) === config.candidateSha, "Candidate SHA changed.");
      invariant(!run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repository }), "Candidate has uncommitted/untracked changes.");
      const remoteMaster = run("git", ["ls-remote", "--exit-code", "origin", "refs/heads/master"], { cwd: repository }).split(/\s/)[0];
      invariant(remoteMaster === config.masterSha, "Live origin/master differs from approved baseline.");
      run("git", ["merge-base", "--is-ancestor", config.masterSha, config.candidateSha], { cwd: repository });
      return { masterSha: remoteMaster, candidateSha: config.candidateSha };
    });
    await check("package", () => { const actual = packageSummary(repository); invariant(canonical(actual) === canonical(config.migrations), "Migration checksums/order changed."); return actual; });
    await check("runbook", () => { invariant(fileHash(path.join(repository, config.runbook)) === config.runbookSha256, "Reviewed runbook changed."); return config.runbookSha256; });
    await check("privacy", () => { invariant(config.privacyDecision && config.privacyDecisionSha256 && fileHash(config.privacyDecision) === config.privacyDecisionSha256, "Reviewed privacy/retention decision artifact is absent or changed."); return config.privacyDecisionSha256; });
    await check("previewGuard", () => {
      invariant(Array.isArray(config.previewGuard) && config.previewGuard.length === 2 && ["lib/p03-preview-safety.ts", "next.config.ts"].every((file) => config.previewGuard.some((item) => item.file === file && item.sha256 === fileHash(path.join(repository, file)))), "Candidate Preview build-isolation guard differs from the reviewed seal.");
      return config.previewGuard;
    });
    await check("browser", () => { invariant(fileHash(config.browserReport) === config.browserReportSha256, "Browser evidence checksum changed."); validateBrowserReport(readJson(config.browserReport), config); return config.browserReportSha256; });
    await check("ci", () => ci(config, repository));
    await check("preview", () => deployment(config, env));
    await check("backup", () => verifyRestoredBackup(backupDirectory, { candidateSha: config.candidateSha, projectRef: PRODUCTION_REF }));
    await check("production", () => {
      const db = connection(env);
      invariant(db.projectRef === PRODUCTION_REF, "Production database endpoint identity mismatch.");
      const snapshot = capture(db, config.tournamentIds, { candidateSha: config.candidateSha });
      invariant(fileHash(path.join(repository, "scripts/p03-db/dependencies.json")) === config.dependencyManifestSha256, "Reviewed database dependency manifest changed.");
      const dependencies = Object.fromEntries(readJson(path.join(repository, "scripts/p03-db/dependencies.json")).map(({ signature, md5 }) => [signature, md5]));
      invariant(canonical(snapshot.state.dependencies) === canonical(dependencies), "Live legal/reset/account-closure function definition differs from the reviewed Production dependency.");
      invariant(canonical(snapshot.state.ledger) === canonical(config.expectedLedger), "Production migration ledger differs, including unexpected/missing P03 migrations.");
      invariant(snapshot.state.matchRoomCapabilities === 0 && snapshot.state.matchRoomTables === 0, "Unexpected P03 objects exist outside the pre-P03 Production migration ledger.");
      invariant(snapshot.state.matchRoomSetting === null, "Pre-P03 bootstrap requires the Match Room setting to be absent; unexpected prior bootstrap state found.");
      invariant(matchRoomIsOff(snapshot.state), "Match Room is not provably OFF.");
      invariant(snapshot.state.canSeeActivity === true, "Database role cannot see lock/transaction activity.");
      invariant(snapshot.state.blockers.length === 0 && snapshot.state.lockWaits === 0 && snapshot.state.writeLocks === 0, "Active transactions/locks prevent a quiet migration window.");
      const assessment = assessCompetition(snapshot);
      invariant(assessment.reasons.length === 0, assessment.reasons.join("; "));
      const quietWindow = assessQuietWindow(snapshot);
      invariant(quietWindow.reasons.length === 0, quietWindow.reasons.join("; "));
      const before = readJson(path.join(backupDirectory, "critical-before.json"));
      const comparison = compare(before, snapshot);
      invariant(comparison.pass, `Competition changed since backup: ${comparison.differences.slice(0, 20).join("; ")}`);
      saveJson(`${output}.fingerprint.json`, snapshot);
      return { projectRef: db.projectRef, ledgerSha256: digest(snapshot.state.ledger), competitionSha256: snapshot.competitionSha256, fingerprintFileSha256: fileHash(`${output}.fingerprint.json`), summary: assessment.summary, quietWindow };
    });
  }
  const result = { schemaVersion: 1, checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), verdict: reasons.length ? "STOP" : "PASS", reasons, evidence, instruction: "Read-only gate complete. No release action was performed. Explicit user instruction PROCEED WITH P03 PRODUCTION RELEASE is still required. Re-run after ten minutes or any state change." };
  saveJson(output, result);
  return result;
}

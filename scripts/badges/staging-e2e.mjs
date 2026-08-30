#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  buildTargetContext,
  canRunRemotePreflight,
  createRunMarker,
  missingRequiredEnvironment,
  openMutationGate,
  parseArguments,
  printEnvironmentSummary,
  printHelp,
  printTargetBanner,
} from "./staging-helpers/project-guard.mjs";
import {
  printPreflightPlan,
  runRemotePreflight,
} from "./staging-helpers/preflight.mjs";
import {
  BADGE_SCENARIOS,
  printHumanReport,
  printScenarioPlan,
  runAppliedBadgeScenarioSuite,
} from "./staging-helpers/assertions.mjs";
import {
  buildCleanupDryRunPlan,
  createManifest,
  loadManifestForResume,
  writeManifest,
} from "./staging-helpers/manifest.mjs";
import { createFixtureContext } from "./staging-helpers/fixtures.mjs";
import {
  runFlawlessAutomaticByePhaseOne,
  runFlawlessAutomaticByePhaseTwo,
} from "./staging-helpers/flawless-campaign.mjs";

async function main() {
  let manifest = null;

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.apply && options.remotePreflight === false) {
    throw new Error("--skip-remote-preflight is dry-run only.");
  }
  validateBadge20PhaseOptions(options);

  const targetContext = buildTargetContext(options);
  const resumeManifest = options.badge20ByePhase === 2
    ? loadManifestForResume({
        manifestPath: options.cleanupManifestPath,
        expectedProjectRef: targetContext.project.ref,
        expectedRunMarker: options.resumeRunMarker,
      })
    : null;
  const runMarker = resumeManifest?.runMarker ?? createRunMarker();

  printTargetBanner({
    targetContext,
    runMarker,
    preflightStatus: "NOT RUN",
  });
  printEnvironmentSummary(targetContext);

  if (options.cleanupDryRun) {
    printCleanupDryRun({ options, targetContext, runMarker });
    return;
  }

  printScenarioPlan();
  printPreflightPlan();

  if (!options.apply) {
    await maybeRunDryRunRemotePreflight({ options, targetContext });
    printDryRunSummary({ targetContext, runMarker });
    return;
  }

  const preflight = await runRemotePreflight({ targetContext });
  const gatedTargetContext = openMutationGate(targetContext, preflight);
  printTargetBanner({
    targetContext: gatedTargetContext,
    runMarker,
    preflightStatus: "PASS",
  });

  manifest = resumeManifest ?? createManifest({
    runMarker,
    projectRef: gatedTargetContext.project.ref,
    environment: gatedTargetContext.project.name,
  });
  manifest.preflight = sanitizePreflight(preflight);
  writeManifest(manifest);

  const ctx = await createFixtureContext({
    targetContext: gatedTargetContext,
    runMarker,
    manifest,
    runMode: options.badge20ByePhase ? "badge20-bye" : "main",
  });
  if (options.badge20ByePhase === 1) {
    const state = await runFlawlessAutomaticByePhaseOne(ctx);
    const manifestPath = writeManifest(manifest);
    printBadge20PhaseResult({ phase: 1, manifestPath, state });
    return;
  }
  if (options.badge20ByePhase === 2) {
    const state = await runFlawlessAutomaticByePhaseTwo(ctx, {
      productionNow: preflight.server_time,
    });
    const manifestPath = writeManifest(manifest);
    printBadge20PhaseResult({ phase: 2, manifestPath, state });
    return;
  }

  const report = await runAppliedBadgeScenarioSuite(ctx);
  const manifestPath = writeManifest(manifest);
  printHumanReport({ targetContext, runMarker, report });
  console.log("");
  console.log(`Manifest: ${manifestPath}`);
} catch (error) {
  if (manifest) {
    manifest.failure = {
      failedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
    try {
      const manifestPath = writeManifest(manifest);
      console.error(`Failure manifest preserved: ${manifestPath}`);
    } catch (manifestError) {
      console.error(
        `Failure manifest could not be written: ${
          manifestError instanceof Error
            ? manifestError.message
            : String(manifestError)
        }`
      );
    }
  }

  console.error(
    error instanceof Error ? error.message : `Unknown failure: ${String(error)}`
  );
  process.exitCode = 1;
}
}

await main();

async function maybeRunDryRunRemotePreflight({ options, targetContext }) {
  if (!options.remotePreflight) {
    console.log("Remote preflight: SKIPPED by --skip-remote-preflight");
    console.log("");
    return;
  }

  if (!canRunRemotePreflight(targetContext)) {
    console.log("Remote preflight: SKIPPED");
    console.log(
      `Absent explicit staging variables: ${missingRequiredEnvironment(
        targetContext.environment
      ).join(", ")}`
    );
    console.log("No remote connection was attempted.");
    console.log("");
    return;
  }

  const result = await runRemotePreflight({ targetContext });
  console.log("Remote preflight: PASS");
  console.log(
    `Read-only object checks completed for ${result.target_environment} (${result.target_ref}).`
  );
  console.log("");
}

function printDryRunSummary({ targetContext, runMarker }) {
  console.log("BADGE STAGING E2E DRY-RUN");
  console.log("=========================");
  console.log(`Environment: ${targetContext.project.name}`);
  console.log(`Project: ${targetContext.project.ref}`);
  console.log(`Run: ${runMarker}`);
  console.log(`Badges planned: ${BADGE_SCENARIOS.length}`);
  console.log("");
  console.log("Dry-run completed without creating, updating, or deleting Supabase rows.");
  console.log("Add --apply only after review to execute the staging harness.");
}

function printCleanupDryRun({ options, targetContext, runMarker }) {
  if (options.apply) {
    throw new Error("--cleanup-dry-run cannot be combined with --apply.");
  }
  if (!options.cleanupManifestPath) {
    throw new Error("--cleanup-dry-run requires --manifest <path>.");
  }

  const manifestPath = resolve(options.cleanupManifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.projectRef !== targetContext.project.ref) {
    throw new Error(
      `Cleanup manifest project ${manifest.projectRef} does not match confirmed ${targetContext.project.ref}.`
    );
  }
  if (!String(manifest.runMarker ?? "").startsWith("badge-e2e-")) {
    throw new Error("Cleanup manifest does not contain a badge-e2e run marker.");
  }
  if (basename(manifestPath) !== `${manifest.runMarker}.json`) {
    throw new Error("Cleanup manifest filename does not match its run marker.");
  }

  const plan = buildCleanupDryRunPlan(manifest);
  console.log("BADGE STAGING E2E CLEANUP DRY-RUN");
  console.log("=================================");
  console.log(`Environment: ${targetContext.project.name}`);
  console.log(`Project: ${targetContext.project.ref}`);
  console.log(`Current command run: ${runMarker}`);
  console.log(`Manifest run: ${manifest.runMarker}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log("");
  if (plan.length === 0) {
    console.log("No manifest-recorded resources would be removed.");
    return;
  }
  for (const item of plan) {
    console.log(
      `${item.kind}\t${item.bucket}\t${item.classification}\t${item.id}\t${item.reason ?? ""}`
    );
  }
  console.log("");
  console.log("No Supabase or Storage mutation was executed.");
}

function sanitizePreflight(preflight) {
  return JSON.parse(JSON.stringify(preflight));
}

function validateBadge20PhaseOptions(options) {
  if (options.cleanupDryRun && options.badge20ByePhase !== null) {
    throw new Error("Badge 20 phase modes cannot be combined with cleanup dry-run.");
  }
  if (
    options.badge20ByePhase === 1 &&
    (options.cleanupManifestPath || options.resumeRunMarker)
  ) {
    throw new Error("Badge 20 phase 1 creates a new manifest and run marker.");
  }
  if (
    options.badge20ByePhase === 2 &&
    (!options.cleanupManifestPath || !options.resumeRunMarker)
  ) {
    throw new Error(
      "Badge 20 phase 2 requires --manifest <path> and --run-marker <marker>."
    );
  }
}

function printBadge20PhaseResult({ phase, manifestPath, state }) {
  console.log(`BADGE 20 AUTOMATIC BYE PHASE ${phase}`);
  console.log("==================================");
  console.log(`Run: ${state.runMarker}`);
  console.log(`State: ${state.phase}`);
  if (phase === 1) {
    console.log(`Required deadline: ${state.expectedDeadline}`);
    console.log("Resume only after that real production deadline has elapsed.");
  } else {
    console.log("Flawless Campaign automatic-bye assertion: PASS");
  }
  console.log(`Manifest: ${manifestPath}`);
}

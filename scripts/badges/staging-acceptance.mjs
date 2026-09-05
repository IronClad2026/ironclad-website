import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  BADGE_ACCEPTANCE_SCENARIOS,
  FIXED_UAT_ALIASES,
  MAX_CONCURRENT_UAT_PLAYERS,
  PRODUCTION_PROJECT_REF,
  SCENARIO_GROUPS,
  STAGING_PROJECT_REF,
  assertStagingProjectRef,
  buildCleanupPlan,
  createAcceptanceTemplate,
  inspectBadgeArtwork,
  validateAcceptanceManifest,
} from "./staging-acceptance-plan.mjs";

if (isDirectExecution()) {
  try {
    const options = parseArguments(process.argv.slice(2));

    if (options.help) {
      printHelp();
    } else {
      assertStagingProjectRef(options.confirmProjectRef);
      run(options);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "badge_acceptance_failed"}\n`
    );
    process.exitCode = 1;
  }
}

function run(options) {
  if (options.mode === "template") {
    printJson(
      createAcceptanceTemplate({
        projectRef: STAGING_PROJECT_REF,
        runMarker: options.runMarker,
      })
    );
    return;
  }

  if (options.mode === "plan") {
    const artwork = inspectBadgeArtwork(process.cwd());
    if (options.json) {
      printJson({
        projectRef: STAGING_PROJECT_REF,
        mode: "read-only-plan",
        maxConcurrentUatPlayers: MAX_CONCURRENT_UAT_PLAYERS,
        fixedUatAliasCount: FIXED_UAT_ALIASES.length,
        scenarioGroups: SCENARIO_GROUPS,
        badges: BADGE_ACCEPTANCE_SCENARIOS,
        artwork,
      });
      return;
    }

    printPlan(artwork);
    return;
  }

  const manifest = JSON.parse(readFileSync(options.manifestPath, "utf8"));
  const result = validateAcceptanceManifest(manifest);

  if (options.mode === "verify") {
    if (options.json) {
      printJson(result);
      return;
    }
    printVerification(result);
    return;
  }

  const cleanupPlan = buildCleanupPlan(manifest);
  if (options.json) {
    printJson({
      projectRef: STAGING_PROJECT_REF,
      mode: "cleanup-dry-run",
      resources: cleanupPlan,
    });
    return;
  }
  printCleanupPlan(cleanupPlan);
}

export function parseArguments(arguments_) {
  const options = {
    confirmProjectRef: null,
    help: false,
    json: false,
    manifestPath: null,
    mode: "plan",
    runMarker: "badge-acceptance-template",
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--confirm-project-ref") {
      options.confirmProjectRef = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--verify-manifest") {
      setManifestMode(options, "verify", arguments_[index + 1]);
      index += 1;
    } else if (argument === "--cleanup-plan") {
      setManifestMode(options, "cleanup-plan", arguments_[index + 1]);
      index += 1;
    } else if (argument === "--template") {
      if (options.mode !== "plan") throw new Error("mode_rejected");
      options.mode = "template";
    } else if (argument === "--run-marker") {
      options.runMarker = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (
      ["--apply", "--mutate", "--cleanup", "--provision"].includes(argument)
    ) {
      throw new Error("mutation_mode_rejected");
    } else {
      throw new Error(`argument_rejected:${argument}`);
    }
  }

  return options;
}

export function buildTemplateForTest(runMarker = "badge-acceptance-test") {
  return createAcceptanceTemplate({
    projectRef: STAGING_PROJECT_REF,
    runMarker,
    createdAt: "2026-08-31T00:00:00.000Z",
  });
}

function setManifestMode(options, mode, manifestPath) {
  if (options.mode !== "plan" || options.manifestPath) {
    throw new Error("mode_rejected");
  }
  if (typeof manifestPath !== "string" || !manifestPath.trim()) {
    throw new Error("manifest_path_rejected");
  }

  options.mode = mode;
  options.manifestPath = manifestPath;
}

function printPlan(artwork) {
  console.log("IRONCLAD BADGE STAGING ACCEPTANCE PLAN");
  console.log(`Target: ironclad-staging (${STAGING_PROJECT_REF})`);
  console.log("Mode: READ ONLY");
  console.log(
    `Existing UAT pool: ${FIXED_UAT_ALIASES.length} fixed aliases; maximum ${MAX_CONCURRENT_UAT_PLAYERS} active in one scenario`
  );
  console.log(`Artwork: ${artwork.length}/30 mapped PNG files`);
  console.log("");
  for (const scenario of BADGE_ACCEPTANCE_SCENARIOS) {
    console.log(
      `${String(scenario.number).padStart(2, "0")} ${scenario.slug.padEnd(30)} ${scenario.group}`
    );
  }
  console.log("");
  console.log("No Supabase, Clerk, Storage, or application mutation was attempted.");
}

function printVerification(result) {
  console.log("IRONCLAD BADGE ACCEPTANCE MANIFEST");
  console.log(`Target: ironclad-staging (${result.projectRef})`);
  console.log(`Run: ${result.runMarker}`);
  for (const [status, count] of Object.entries(result.counts)) {
    console.log(`${status}: ${count}`);
  }
  console.log(`All badges pass: ${result.allBadgesPass ? "YES" : "NO"}`);
  console.log(
    `Shared notification/reveal checks pass: ${result.sharedExperiencePass ? "YES" : "NO"}`
  );
}

function printCleanupPlan(plan) {
  console.log("IRONCLAD BADGE CLEANUP DRY-RUN");
  console.log(`Target: ironclad-staging (${STAGING_PROJECT_REF})`);
  if (plan.length === 0) {
    console.log("No exact-ID resources are eligible for supported cleanup.");
  } else {
    for (const resource of plan) {
      console.log(
        `${resource.kind}\t${resource.id}\t${resource.alias ?? ""}\t${resource.tournamentId ?? ""}`
      );
    }
  }
  console.log("No mutation was attempted.");
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] &&
      fileURLToPath(import.meta.url) === resolve(process.argv[1])
  );
}

function printHelp() {
  console.log(`Usage:
  node scripts/badges/staging-acceptance.mjs \\
    --confirm-project-ref ${STAGING_PROJECT_REF} [--json]

  node scripts/badges/staging-acceptance.mjs \\
    --confirm-project-ref ${STAGING_PROJECT_REF} \\
    --template --run-marker badge-acceptance-<run> > sanitized-evidence.json

  node scripts/badges/staging-acceptance.mjs \\
    --confirm-project-ref ${STAGING_PROJECT_REF} \\
    --verify-manifest <sanitized-evidence.json> [--json]

  node scripts/badges/staging-acceptance.mjs \\
    --confirm-project-ref ${STAGING_PROJECT_REF} \\
    --cleanup-plan <sanitized-evidence.json> [--json]

This tool is deliberately read-only. It has no apply, provision, cleanup, or
award-mutation mode. The production ref ${PRODUCTION_PROJECT_REF} is rejected.`);
}

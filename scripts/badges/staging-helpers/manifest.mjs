import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";

const MANIFEST_DIRECTORY = resolve("artifacts", "badge-e2e");
const SECRET_KEY_PATTERN =
  /(authorization|bearer|jwt|service.?role|access.?token|anon.?key|secret)/iu;
const SAFE_DIAGNOSTIC_KEY_PATTERN =
  /^service_role_(?:table_issues|table_mutation_issues|function_issues)$/iu;
const REDACTED_PRIVATE_KEYS = new Set(["__secretDenyList", "__manifestPath"]);
const CLEANUP_ELIGIBLE_CLASSIFICATIONS = new Set([
  "SAFE_TO_DELETE",
  "FAILED_BEFORE_LAUNCH",
]);

export function createManifest({ runMarker, projectRef, environment }) {
  const manifest = {
    schemaVersion: 1,
    runMarker,
    timestamp: new Date().toISOString(),
    projectRef,
    environment,
    manifestPath: resolve(MANIFEST_DIRECTORY, `${runMarker}.json`),
    created: {
      playerIds: [],
      tournamentIds: [],
      registrationIds: [],
      registrationAcceptanceIds: [],
      bracketIds: [],
      generatedBracketIds: [],
      matchIds: [],
      reportGroupIds: [],
      submissionIds: [],
      seasonIds: [],
      replayAttemptIds: [],
      storagePaths: [],
    },
    scenarios: {},
    expectedBadgeAwards: [],
    actualBadgeAwards: [],
    negativeAssertions: [],
    evaluatorInvocations: [],
    securityAssertions: [],
    idempotencyAssertions: [],
    correctionAssertions: [],
    unexpectedAwards: [],
    cleanup: {
      eligibility: {},
      status: "NOT_STARTED",
      notes: [
        "Completed or launched staging tournaments are retained as staging history.",
        "The harness does not use hard-delete SQL or weaken tournament history guards.",
      ],
    },
  };

  Object.defineProperty(manifest, "__secretDenyList", {
    configurable: false,
    enumerable: false,
    value: new Set(),
    writable: false,
  });
  Object.defineProperty(manifest, "__manifestPath", {
    configurable: false,
    enumerable: false,
    value: manifest.manifestPath,
    writable: false,
  });

  return manifest;
}

export function recordCreated(manifest, kind, id) {
  const target = manifest.created[kind];

  if (!Array.isArray(target)) {
    throw new Error(`Unknown manifest created bucket: ${kind}`);
  }

  if (id && !target.includes(id)) {
    target.push(id);
    persistManifest(manifest);
  }
}

export function recordScenario(manifest, scenarioKey, details) {
  manifest.scenarios[scenarioKey] = {
    ...(manifest.scenarios[scenarioKey] ?? {}),
    ...details,
  };
  persistManifest(manifest);
}

export function recordExpectedAward(manifest, input) {
  pushUnique(manifest.expectedBadgeAwards, input, [
    "playerId",
    "badgeSlug",
    "scenario",
  ]);
  persistManifest(manifest);
}

export function recordActualAward(manifest, input) {
  pushUnique(manifest.actualBadgeAwards, input, [
    "playerId",
    "badgeSlug",
    "awardId",
  ]);
  persistManifest(manifest);
}

export function recordNegativeAssertion(manifest, input) {
  manifest.negativeAssertions.push({
    checkedAt: new Date().toISOString(),
    ...input,
  });
  persistManifest(manifest);
}

export function recordEvaluatorInvocation(manifest, input) {
  manifest.evaluatorInvocations.push({
    checkedAt: new Date().toISOString(),
    ...input,
  });
  persistManifest(manifest);
}

export function recordSecurityAssertion(manifest, input) {
  manifest.securityAssertions.push({
    checkedAt: new Date().toISOString(),
    ...input,
  });
  persistManifest(manifest);
}

export function recordIdempotencyAssertion(manifest, input) {
  manifest.idempotencyAssertions.push({
    checkedAt: new Date().toISOString(),
    ...input,
  });
  persistManifest(manifest);
}

export function recordCorrectionAssertion(manifest, input) {
  manifest.correctionAssertions.push({
    checkedAt: new Date().toISOString(),
    ...input,
  });
  persistManifest(manifest);
}

export function classifyCleanup(manifest, id, classification, reason) {
  manifest.cleanup.eligibility[id] = {
    classification,
    reason,
  };
  persistManifest(manifest);
}

export function protectLaunchedHistory(manifest, resources) {
  const reason =
    "Resource is linked to launched or completed staging tournament history.";
  for (const values of Object.values(resources)) {
    for (const id of values ?? []) {
      if (id) {
        manifest.cleanup.eligibility[id] = {
          classification: "MUST_RETAIN_AS_STAGING_HISTORY",
          reason,
        };
      }
    }
  }
  persistManifest(manifest);
}

export function recordUnexpectedAwards(manifest, awards) {
  manifest.unexpectedAwards = awards.map((award) => ({ ...award }));
  persistManifest(manifest);
}

export function registerManifestSecretDenyList(manifest, values) {
  for (const value of values) {
    if (typeof value === "string" && value.length >= 12) {
      manifest.__secretDenyList.add(value);
    }
  }
}

export function writeManifest(manifest) {
  if (!existsSync(MANIFEST_DIRECTORY)) {
    mkdirSync(MANIFEST_DIRECTORY, { recursive: true });
  }

  assertManifestContainsNoSecrets(manifest);

  const path = manifest.__manifestPath ?? resolve(
    MANIFEST_DIRECTORY,
    `${manifest.runMarker}.json`
  );
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(publicManifest(manifest), null, 2)}\n`, {
    encoding: "utf8",
  });
  renameSync(temporaryPath, path);

  return path;
}

export function loadManifestForResume({
  manifestPath,
  expectedProjectRef,
  expectedRunMarker,
}) {
  if (!manifestPath) {
    throw new Error("Badge 20 resume requires --manifest <path>.");
  }
  if (!expectedRunMarker) {
    throw new Error("Badge 20 resume requires --run-marker <marker>.");
  }

  const path = resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(path, "utf8"));

  if (manifest.schemaVersion !== 1) {
    throw new Error("Badge 20 resume manifest schema is unsupported.");
  }
  if (manifest.projectRef !== expectedProjectRef) {
    throw new Error(
      `Badge 20 resume manifest project ${manifest.projectRef ?? "missing"} does not match ${expectedProjectRef}.`
    );
  }
  if (manifest.environment !== "ironclad-staging") {
    throw new Error("Badge 20 resume manifest environment is not staging.");
  }
  if (manifest.runMarker !== expectedRunMarker) {
    throw new Error("Badge 20 resume manifest run marker does not match --run-marker.");
  }
  if (basename(path) !== `${expectedRunMarker}.json`) {
    throw new Error("Badge 20 resume manifest filename does not match its run marker.");
  }
  if (resolve(manifest.manifestPath ?? "") !== path) {
    throw new Error("Badge 20 resume manifest path does not match its recorded path.");
  }

  attachManifestRuntimeState(manifest, path);
  return manifest;
}

export function buildCleanupDryRunPlan(manifest) {
  assertCleanupManifestScoped(manifest);

  const created = manifest.created ?? {};
  return [
    ...planRows("storage", created.storagePaths, "storagePaths", manifest),
    ...planRows("report-group", created.reportGroupIds, "reportGroupIds", manifest),
    ...planRows("replay-attempt", created.replayAttemptIds, "replayAttemptIds", manifest),
    ...planRows("submission", created.submissionIds, "submissionIds", manifest),
    ...planRows("registration-acceptance", created.registrationAcceptanceIds, "registrationAcceptanceIds", manifest),
    ...planRows("registration", created.registrationIds, "registrationIds", manifest),
    ...planRows("match", created.matchIds, "matchIds", manifest),
    ...planRows("generated-bracket", created.generatedBracketIds, "generatedBracketIds", manifest),
    ...planRows("bracket", created.bracketIds, "bracketIds", manifest),
    ...planRows("tournament", created.tournamentIds, "tournamentIds", manifest),
    ...planRows("season", created.seasonIds, "seasonIds", manifest),
    ...planRows("player", created.playerIds, "playerIds", manifest),
  ].filter((entry) =>
    CLEANUP_ELIGIBLE_CLASSIFICATIONS.has(entry.classification)
  );
}

export function assertCleanupManifestScoped(manifest) {
  if (!String(manifest?.runMarker ?? "").startsWith("badge-e2e-")) {
    throw new Error("Cleanup manifest does not contain a badge-e2e run marker.");
  }

  const created = manifest.created ?? {};
  const storagePaths = created.storagePaths ?? [];
  if (!Array.isArray(storagePaths)) {
    throw new Error("Cleanup manifest storagePaths bucket is invalid.");
  }

  for (const path of storagePaths) {
    if (
      typeof path !== "string" ||
      !path.startsWith(`${manifest.runMarker}/`)
    ) {
      throw new Error(
        `Cleanup manifest contains a storage path outside run ${manifest.runMarker}.`
      );
    }
  }

  if (manifest.cleanup?.deleteFilters || manifest.cleanup?.broadFilters) {
    throw new Error("Cleanup manifest contains broad cleanup filters.");
  }
}

function pushUnique(target, input, keys) {
  if (
    target.some((entry) =>
      keys.every((key) => entry[key] === input[key])
    )
  ) {
    return;
  }

  target.push({
    recordedAt: new Date().toISOString(),
    ...input,
  });
}

function persistManifest(manifest) {
  if (manifest?.__manifestPath) {
    writeManifest(manifest);
  }
}

function attachManifestRuntimeState(manifest, path) {
  Object.defineProperty(manifest, "__secretDenyList", {
    configurable: false,
    enumerable: false,
    value: new Set(),
    writable: false,
  });
  Object.defineProperty(manifest, "__manifestPath", {
    configurable: false,
    enumerable: false,
    value: path,
    writable: false,
  });
}

function publicManifest(manifest) {
  return Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !REDACTED_PRIVATE_KEYS.has(key))
  );
}

function assertManifestContainsNoSecrets(manifest) {
  const denyList = manifest.__secretDenyList ?? new Set();

  function visit(value, path) {
    if (typeof value === "string") {
      for (const secret of denyList) {
        if (value.includes(secret)) {
          throw new Error(`Manifest write blocked: secret value at ${path}.`);
        }
      }
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key) && !SAFE_DIAGNOSTIC_KEY_PATTERN.test(key)) {
        throw new Error(`Manifest write blocked: secret-shaped key ${path}.${key}.`);
      }
      visit(child, `${path}.${key}`);
    }
  }

  visit(publicManifest(manifest), "manifest");
}

function planRows(kind, values, bucket, manifest) {
  return (values ?? []).map((id) => ({
    kind,
    bucket,
    id,
    runMarker: manifest.runMarker,
    classification:
      manifest.cleanup?.eligibility?.[id]?.classification ?? "UNCLASSIFIED",
    reason: manifest.cleanup?.eligibility?.[id]?.reason ?? null,
    wouldMutate: false,
  }));
}

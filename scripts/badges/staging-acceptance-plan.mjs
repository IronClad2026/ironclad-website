import {
  closeSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

export const STAGING_PROJECT_REF = "zzbnneprhjicmajpjkdg";
export const PRODUCTION_PROJECT_REF = "nsyjtqpvyxlzyujlbzos";
export const ACCEPTANCE_SCHEMA_VERSION = 1;
export const ACCEPTANCE_PROVENANCE = "badge-acceptance-v1";
export const MAX_CONCURRENT_UAT_PLAYERS = 8;

export const ACCEPTANCE_STATUSES = Object.freeze([
  "PASS",
  "FAIL",
  "BLOCKED",
  "INCONCLUSIVE",
]);

export const FIXED_UAT_POOLS = Object.freeze({
  academy: fixturePool("TestAcademy"),
  challenge: fixturePool("TestChallenge"),
  main: fixturePool("TestMain"),
});

export const FIXED_UAT_ALIASES = Object.freeze(
  Object.values(FIXED_UAT_POOLS).flat()
);

export const SCENARIO_GROUPS = Object.freeze([
  Object.freeze({
    key: "provider-recruit",
    execution: "owner-provider-checkpoint",
    targetAlias: null,
    fixturePool: null,
    badges: Object.freeze([1]),
    purpose:
      "Legitimate profile, Steam identity, and Relic verification; synthetic UAT proves only the unverified negative.",
  }),
  Object.freeze({
    key: "match-career",
    execution: "existing-uat-authority",
    targetAlias: "TestAcademy1",
    fixturePool: "academy",
    badges: Object.freeze([2, 3, 4, 11, 12, 13, 14, 15]),
    purpose:
      "One isolated career target reuses official match finalisation for played, win, count, and streak thresholds.",
  }),
  Object.freeze({
    key: "reliability-boundaries",
    execution: "existing-uat-authority",
    targetAlias: "TestAcademy2",
    fixturePool: "academy",
    badges: Object.freeze([10]),
    purpose:
      "An isolated target proves ten reliable outcomes and the player-no-show, double-no-show, correction, and bye boundaries.",
  }),
  Object.freeze({
    key: "series-shape",
    execution: "existing-uat-authority",
    targetAlias: "TestChallenge1",
    fixturePool: "challenge",
    badges: Object.freeze([16, 17]),
    purpose:
      "Shared BO3/BO5 result paths prove clean-sweep and ordered comeback authority.",
  }),
  Object.freeze({
    key: "verified-upsets",
    execution: "owner-provider-checkpoint",
    targetAlias: null,
    fixturePool: null,
    badges: Object.freeze([18, 19]),
    purpose:
      "Legitimate immutable Relic-qualified registration snapshots prove one and three 200-point upset wins.",
  }),
  Object.freeze({
    key: "academy-tournament-career",
    execution: "existing-uat-authority",
    targetAlias: "TestAcademy3",
    fixturePool: "academy",
    badges: Object.freeze([6, 7, 8, 21, 22, 23, 24, 27]),
    purpose:
      "Reuses official Academy tournament paths and prior rehearsal evidence for completion, rounds, championship, and repeat-champion thresholds.",
  }),
  Object.freeze({
    key: "challenge-champion",
    execution: "existing-uat-authority",
    targetAlias: "TestChallenge2",
    fixturePool: "challenge",
    badges: Object.freeze([25]),
    purpose: "One official Challenge championship path.",
  }),
  Object.freeze({
    key: "main-champion",
    execution: "existing-uat-authority",
    targetAlias: "TestMain1",
    fixturePool: "main",
    badges: Object.freeze([26]),
    purpose: "One official Main/Elite championship path.",
  }),
  Object.freeze({
    key: "division-progression",
    execution: "existing-authority-evidence",
    targetAlias: null,
    fixturePool: null,
    badges: Object.freeze([5]),
    purpose:
      "Requires one legitimate player whose first completed qualifying tournament was followed by a completed higher-division tournament.",
  }),
  Object.freeze({
    key: "triple-crown",
    execution: "existing-authority-evidence",
    targetAlias: null,
    fixturePool: null,
    badges: Object.freeze([28]),
    purpose:
      "Requires one legitimate player with Academy, Challenge, and Main/Elite championship authority; fixed-division synthetic aliases cannot fabricate this path.",
  }),
  Object.freeze({
    key: "flawless-played-champion",
    execution: "existing-uat-authority",
    targetAlias: "TestChallenge3",
    fixturePool: "challenge",
    badges: Object.freeze([20]),
    purpose:
      "Official champion with at least one genuinely played series and zero individual game losses; no timestamp manipulation.",
  }),
  Object.freeze({
    key: "finalized-season",
    execution: "existing-uat-authority",
    targetAlias: "TestMain2",
    fixturePool: "main",
    badges: Object.freeze([9, 29, 30]),
    purpose:
      "One finalized, non-under-review season cohort covers four-event participation, podium, and champion authority.",
  }),
]);

export const BADGE_ACCEPTANCE_SCENARIOS = Object.freeze([
  badge(1, "ironclad-recruit", "provider-recruit", "Legitimate completed profile plus Steam/Relic-qualified identity.", "Any missing protected provider fact; fixed synthetic UAT player must remain unqualified.", "players profile and protected Steam/Relic fields", true, false),
  badge(2, "first-deployment", "match-career", "First genuinely played official series.", "No played series; no-show, double no-show, and automatic bye remain excluded.", "match participant outcome authority", false, true),
  badge(3, "first-victory", "match-career", "First genuinely played official series win.", "Played loss and non-played administrative outcomes.", "match participant outcome authority", false, true),
  badge(4, "battle-tested", "match-career", "Exactly ten genuinely played official series.", "Nine played series; no-shows and byes do not fill the gap.", "match participant outcome authority summary", false, true),
  badge(5, "rising-through-the-ranks", "division-progression", "Complete a qualifying tournament above the first division in which the player completed one.", "Registrations without completion, or later completion in the same/lower division.", "completed tournament bracket progression summary", false, true),
  badge(6, "first-campaign", "academy-tournament-career", "First qualifying tournament completion.", "Registered or launched tournament that has not authoritatively completed.", "leaderboard participation/completion authority", false, false),
  badge(7, "iron-regular", "academy-tournament-career", "Exactly three qualifying tournament completions.", "Two qualifying completions.", "tournament completion summary", false, true),
  badge(8, "tournament-veteran", "academy-tournament-career", "Exactly ten qualifying tournament completions.", "Nine qualifying completions.", "tournament completion summary", false, true),
  badge(9, "season-campaigner", "finalized-season", "Complete at least four qualifying tournaments in one season.", "Three qualifying tournaments, or an under-review/non-final authority state.", "season membership and participation authority", false, true),
  badge(10, "reliable-competitor", "reliability-boundaries", "Ten consecutive reliable scheduled outcomes under the Badge-specific authority.", "Player no-show resets; double no-show and automatic bye do not advance; latest correction governs.", "match participant outcome authority", false, true),
  badge(11, "five-victories", "match-career", "Exactly five genuinely played official series wins.", "Four wins.", "match participant outcome authority summary", false, true),
  badge(12, "ten-victories", "match-career", "Exactly ten genuinely played official series wins.", "Nine wins.", "match participant outcome authority summary", false, true),
  badge(13, "twenty-five-victories", "match-career", "Exactly twenty-five genuinely played official series wins.", "Twenty-four wins.", "match participant outcome authority summary", false, true),
  badge(14, "iron-streak", "match-career", "Three consecutive genuinely played official series wins.", "Two wins, or a played loss before the third.", "ordered match participant authority", false, true),
  badge(15, "unbroken", "match-career", "Five consecutive genuinely played official series wins.", "Four wins followed by a played loss.", "ordered match participant authority", false, true),
  badge(16, "clean-sweep", "series-shape", "Official BO3 2-0 or BO5 3-0 win.", "2-1/3-1/3-2, incomplete game authority, correction, reset, or void.", "game result and official series authority", false, true),
  badge(17, "comeback-commander", "series-shape", "Lose Game 1, then win the official series.", "Win Game 1, lose the series, missing game order, reset, or void.", "ordered game result authority", false, true),
  badge(18, "giant-slayer", "verified-upsets", "One official win against a legitimately verified registration snapshot at least 200 ELO higher.", "199-point delta, missing verification, non-played result, reset, or void.", "immutable verified registration ELO snapshots", true, true),
  badge(19, "giant-hunter", "verified-upsets", "Three distinct legitimate Giant Slayer wins.", "Two qualifying upsets or duplicate evaluation of one upset.", "immutable verified registration ELO snapshots", true, true),
  badge(20, "flawless-campaign", "flawless-played-champion", "Champion with at least one genuinely played official series and zero individual game losses.", "All-bye/all-opponent-no-show champion, one game loss, incomplete path, reset, or void.", "championship path plus game authority", false, true),
  badge(21, "first-advance", "academy-tournament-career", "First played bracket-round win that advances the player.", "First-round exit or automatic bye only.", "leaderboard played_match_win event", false, false),
  badge(22, "semifinalist", "academy-tournament-career", "Reach an official semifinal.", "Exit before semifinal or invalidated bracket path.", "tournament bracket progression authority", false, false),
  badge(23, "finalist", "academy-tournament-career", "Reach an official final.", "Semifinal exit or invalidated bracket path.", "tournament bracket progression authority", false, false),
  badge(24, "academy-champion", "academy-tournament-career", "Official Academy tournament championship.", "Academy finalist loss, cancellation, reset, or void.", "tournament_win leaderboard event", false, false),
  badge(25, "challenge-champion", "challenge-champion", "Official Challenge tournament championship.", "Challenge finalist loss, cancellation, reset, or void.", "tournament_win leaderboard event", false, false),
  badge(26, "elite-champion", "main-champion", "Official Main/Elite tournament championship.", "Main finalist loss, cancellation, reset, or void.", "tournament_win leaderboard event", false, false),
  badge(27, "double-champion", "academy-tournament-career", "Win two distinct official tournaments.", "One championship or duplicate evaluation of one tournament.", "distinct tournament_win leaderboard events", false, true),
  badge(28, "triple-crown", "triple-crown", "Win Academy, Challenge, and Main/Elite official tournaments.", "Only two distinct championship divisions or invalidated championship.", "division-specific tournament_win authority", false, true),
  badge(29, "season-podium", "finalized-season", "Finish rank 1-3 in a finalized, non-under-review season.", "Rank 4 or an under-review/non-final season.", "finalized season standings archive", false, true),
  badge(30, "season-champion", "finalized-season", "Finish rank 1 in a finalized, non-under-review season.", "Rank 2 or an under-review/non-final season.", "season champion archive", false, true),
]);

const BADGE_BY_NUMBER = new Map(
  BADGE_ACCEPTANCE_SCENARIOS.map((scenario) => [scenario.number, scenario])
);

export function assertStagingProjectRef(projectRef) {
  const normalized = typeof projectRef === "string" ? projectRef.trim() : "";

  if (normalized === PRODUCTION_PROJECT_REF) {
    throw new Error("production_project_rejected");
  }
  if (normalized !== STAGING_PROJECT_REF) {
    throw new Error("staging_project_rejected");
  }

  return normalized;
}

export function createAcceptanceTemplate({
  projectRef,
  runMarker = "badge-acceptance-template",
  createdAt = new Date().toISOString(),
} = {}) {
  assertStagingProjectRef(projectRef);
  assertRunMarker(runMarker);

  return {
    schemaVersion: ACCEPTANCE_SCHEMA_VERSION,
    projectRef: STAGING_PROJECT_REF,
    environment: "ironclad-staging",
    provenance: ACCEPTANCE_PROVENANCE,
    runMarker,
    createdAt,
    permanentUatAliases: [...FIXED_UAT_ALIASES],
    resources: [],
    badgeResults: BADGE_ACCEPTANCE_SCENARIOS.map((scenario) => ({
      number: scenario.number,
      slug: scenario.slug,
      positiveScenario: scenario.positiveScenario,
      negativeScenario: scenario.negativeScenario,
      authorityEvidence: {
        status: "INCONCLUSIVE",
        source: scenario.authoritySource,
        sourceIds: [],
      },
      awardEvidence: {
        status: "INCONCLUSIVE",
        playerId: null,
        awardId: null,
        rowCount: 0,
      },
      idempotency: {
        status: "INCONCLUSIVE",
        evaluationAttempts: 0,
        repeatCreatedCount: null,
        duplicateRows: null,
      },
      artworkCollection: {
        status: "INCONCLUSIVE",
        assetPath: `/assets/badges/${scenario.number}.png`,
        collectionSlot: scenario.number,
      },
      finalStatus: scenario.ownerProviderRequired ? "BLOCKED" : "INCONCLUSIVE",
      externalCheckpoint: scenario.ownerProviderRequired
        ? "owner-controlled-steam-relic"
        : scenario.number === 20
          ? "real-authority-path-if-no-existing-evidence"
          : null,
    })),
    sharedExperience: {
      notification: "INCONCLUSIVE",
      reveal: "INCONCLUSIVE",
      queue: "INCONCLUSIVE",
      dismissalPersistence: "INCONCLUSIVE",
      acknowledgementRetry: "INCONCLUSIVE",
      reducedMotion: "INCONCLUSIVE",
      responsiveTransfer: "INCONCLUSIVE",
    },
  };
}

export function validateAcceptanceManifest(manifest) {
  assertSafeManifestValue(manifest);

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("manifest_invalid");
  }
  const allowedManifestKeys = new Set([
    "schemaVersion",
    "projectRef",
    "environment",
    "provenance",
    "runMarker",
    "createdAt",
    "permanentUatAliases",
    "resources",
    "badgeResults",
    "sharedExperience",
  ]);
  if (Object.keys(manifest).some((key) => !allowedManifestKeys.has(key))) {
    throw new Error("manifest_field_rejected");
  }
  if (manifest.schemaVersion !== ACCEPTANCE_SCHEMA_VERSION) {
    throw new Error("manifest_schema_rejected");
  }
  assertStagingProjectRef(manifest.projectRef);
  if (
    manifest.environment !== "ironclad-staging" ||
    manifest.provenance !== ACCEPTANCE_PROVENANCE
  ) {
    throw new Error("manifest_scope_rejected");
  }
  assertRunMarker(manifest.runMarker);
  if (
    typeof manifest.createdAt !== "string" ||
    Number.isNaN(Date.parse(manifest.createdAt))
  ) {
    throw new Error("manifest_created_at_rejected");
  }
  if (!Array.isArray(manifest.permanentUatAliases)) {
    throw new Error("manifest_uat_aliases_rejected");
  }
  if (
    manifest.permanentUatAliases.length !== FIXED_UAT_ALIASES.length ||
    manifest.permanentUatAliases.some(
      (alias, index) => alias !== FIXED_UAT_ALIASES[index]
    )
  ) {
    throw new Error("manifest_uat_aliases_rejected");
  }

  validateResources(manifest.resources, manifest.runMarker);

  if (!Array.isArray(manifest.badgeResults) || manifest.badgeResults.length !== 30) {
    throw new Error("manifest_badge_results_rejected");
  }

  for (let index = 0; index < BADGE_ACCEPTANCE_SCENARIOS.length; index += 1) {
    const expected = BADGE_ACCEPTANCE_SCENARIOS[index];
    validateBadgeResult(manifest.badgeResults[index], expected);
  }

  validateSharedExperience(manifest.sharedExperience);

  return {
    projectRef: STAGING_PROJECT_REF,
    runMarker: manifest.runMarker,
    counts: Object.fromEntries(
      ACCEPTANCE_STATUSES.map((status) => [
        status,
        manifest.badgeResults.filter((row) => row.finalStatus === status).length,
      ])
    ),
    allBadgesPass: manifest.badgeResults.every(
      (row) => row.finalStatus === "PASS"
    ),
    sharedExperiencePass: Object.values(manifest.sharedExperience).every(
      (status) => status === "PASS"
    ),
  };
}

export function buildCleanupPlan(manifest) {
  validateAcceptanceManifest(manifest);

  return manifest.resources
    .filter((resource) => resource.cleanupDisposition === "supported-exact-id")
    .map((resource) => ({
      kind: resource.kind,
      id: resource.id,
      runMarker: manifest.runMarker,
      provenance: ACCEPTANCE_PROVENANCE,
      alias: resource.alias ?? null,
      tournamentId: resource.tournamentId ?? null,
      wouldMutate: false,
    }));
}

export function inspectBadgeArtwork(repositoryRoot = process.cwd()) {
  return BADGE_ACCEPTANCE_SCENARIOS.map((scenario) => {
    const relativePath = `public/assets/badges/${scenario.number}.png`;
    const absolutePath = resolve(repositoryRoot, relativePath);
    const header = Buffer.alloc(26);
    const descriptor = openSync(absolutePath, "r");

    try {
      const bytesRead = readSync(descriptor, header, 0, header.length, 0);
      if (bytesRead !== header.length || !isPngSignature(header)) {
        throw new Error(`badge_artwork_invalid:${scenario.number}`);
      }
    } finally {
      closeSync(descriptor);
    }

    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    const colorType = header[25];
    const bytes = statSync(absolutePath).size;

    if (width <= 0 || height <= 0 || bytes <= 0) {
      throw new Error(`badge_artwork_invalid:${scenario.number}`);
    }

    return Object.freeze({
      number: scenario.number,
      slug: scenario.slug,
      assetPath: `/assets/badges/${scenario.number}.png`,
      width,
      height,
      bytes,
      alphaCapable: colorType === 4 || colorType === 6,
    });
  });
}

export function getScenarioForBadge(number) {
  return BADGE_BY_NUMBER.get(number) ?? null;
}

function fixturePool(prefix) {
  return Object.freeze(
    Array.from({ length: MAX_CONCURRENT_UAT_PLAYERS }, (_, index) =>
      `${prefix}${index + 1}`
    )
  );
}

function badge(
  number,
  slug,
  group,
  positiveScenario,
  negativeScenario,
  authoritySource,
  ownerProviderRequired,
  requiresIsolatedTarget
) {
  return Object.freeze({
    number,
    slug,
    group,
    positiveScenario,
    negativeScenario,
    authoritySource,
    ownerProviderRequired,
    requiresIsolatedTarget,
    assetPath: `/assets/badges/${number}.png`,
  });
}

function assertRunMarker(runMarker) {
  if (
    typeof runMarker !== "string" ||
    !/^badge-acceptance-[a-z0-9][a-z0-9-]{0,79}$/u.test(runMarker)
  ) {
    throw new Error("run_marker_rejected");
  }
}

function validateResources(resources, runMarker) {
  if (!Array.isArray(resources)) {
    throw new Error("manifest_resources_rejected");
  }

  const allowedKinds = new Set([
    "uat-enrolment",
    "tournament",
    "bracket",
    "match",
    "report-group",
    "notification",
    "reveal",
    "storage-object",
  ]);
  const allowedCleanup = new Set([
    "supported-exact-id",
    "retain-authoritative-history",
    "not-owned",
  ]);
  const seen = new Set();
  const allowedResourceKeys = new Set([
    "kind",
    "id",
    "cleanupDisposition",
    "provenance",
    "runMarker",
    "alias",
    "tournamentId",
  ]);

  for (const resource of resources) {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
      throw new Error("manifest_resource_rejected");
    }
    if (Object.keys(resource).some((key) => !allowedResourceKeys.has(key))) {
      throw new Error("manifest_resource_field_rejected");
    }
    if (
      !allowedKinds.has(resource.kind) ||
      !allowedCleanup.has(resource.cleanupDisposition) ||
      resource.provenance !== ACCEPTANCE_PROVENANCE ||
      resource.runMarker !== runMarker
    ) {
      throw new Error("manifest_resource_scope_rejected");
    }
    if (!isUuid(resource.id) && !isRunScopedStoragePath(resource, runMarker)) {
      throw new Error("manifest_resource_id_rejected");
    }
    if (resource.alias != null && !FIXED_UAT_ALIASES.includes(resource.alias)) {
      throw new Error("manifest_resource_alias_rejected");
    }
    if (resource.tournamentId != null && !isUuid(resource.tournamentId)) {
      throw new Error("manifest_resource_tournament_rejected");
    }
    if (
      resource.cleanupDisposition === "supported-exact-id" &&
      resource.kind === "uat-enrolment" &&
      (!resource.alias || !resource.tournamentId)
    ) {
      throw new Error("manifest_cleanup_scope_rejected");
    }
    if (
      resource.cleanupDisposition === "supported-exact-id" &&
      !["uat-enrolment", "notification", "reveal"].includes(
        resource.kind
      )
    ) {
      throw new Error("manifest_cleanup_scope_rejected");
    }

    const identity = `${resource.kind}:${resource.id}`;
    if (seen.has(identity)) {
      throw new Error("manifest_resource_duplicate");
    }
    seen.add(identity);
  }
}

function validateBadgeResult(result, expected) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("manifest_badge_result_rejected");
  }
  if (
    result.number !== expected.number ||
    result.slug !== expected.slug ||
    result.positiveScenario !== expected.positiveScenario ||
    result.negativeScenario !== expected.negativeScenario
  ) {
    throw new Error(`manifest_badge_identity_rejected:${expected.number}`);
  }
  for (const status of [
    result.authorityEvidence?.status,
    result.awardEvidence?.status,
    result.idempotency?.status,
    result.artworkCollection?.status,
    result.finalStatus,
  ]) {
    if (!ACCEPTANCE_STATUSES.includes(status)) {
      throw new Error(`manifest_badge_status_rejected:${expected.number}`);
    }
  }
  if (
    result.authorityEvidence.source !== expected.authoritySource ||
    !Array.isArray(result.authorityEvidence.sourceIds) ||
    result.authorityEvidence.sourceIds.some((id) => !isUuid(id))
  ) {
    throw new Error(`manifest_authority_evidence_rejected:${expected.number}`);
  }
  if (
    result.artworkCollection.assetPath !== expected.assetPath ||
    result.artworkCollection.collectionSlot !== expected.number
  ) {
    throw new Error(`manifest_artwork_mapping_rejected:${expected.number}`);
  }
  if (
    result.awardEvidence.playerId != null &&
    !isUuid(result.awardEvidence.playerId)
  ) {
    throw new Error(`manifest_award_player_rejected:${expected.number}`);
  }
  if (
    result.awardEvidence.awardId != null &&
    !isUuid(result.awardEvidence.awardId)
  ) {
    throw new Error(`manifest_award_id_rejected:${expected.number}`);
  }
  if (!Number.isInteger(result.awardEvidence.rowCount) || result.awardEvidence.rowCount < 0) {
    throw new Error(`manifest_award_count_rejected:${expected.number}`);
  }
  if (
    !Number.isInteger(result.idempotency.evaluationAttempts) ||
    result.idempotency.evaluationAttempts < 0 ||
    !nullableNonNegativeInteger(result.idempotency.repeatCreatedCount) ||
    !nullableNonNegativeInteger(result.idempotency.duplicateRows)
  ) {
    throw new Error(`manifest_idempotency_rejected:${expected.number}`);
  }

  if (result.finalStatus === "PASS") {
    if (
      result.authorityEvidence.status !== "PASS" ||
      result.authorityEvidence.sourceIds.length === 0 ||
      result.awardEvidence.status !== "PASS" ||
      !isUuid(result.awardEvidence.playerId) ||
      !isUuid(result.awardEvidence.awardId) ||
      result.awardEvidence.rowCount !== 1 ||
      result.idempotency.status !== "PASS" ||
      result.idempotency.evaluationAttempts < 2 ||
      result.idempotency.repeatCreatedCount !== 0 ||
      result.idempotency.duplicateRows !== 0 ||
      result.artworkCollection.status !== "PASS"
    ) {
      throw new Error(`manifest_pass_evidence_incomplete:${expected.number}`);
    }
  }
}

function validateSharedExperience(sharedExperience) {
  const requiredKeys = [
    "notification",
    "reveal",
    "queue",
    "dismissalPersistence",
    "acknowledgementRetry",
    "reducedMotion",
    "responsiveTransfer",
  ];

  if (
    !sharedExperience ||
    typeof sharedExperience !== "object" ||
    Array.isArray(sharedExperience) ||
    Object.keys(sharedExperience).length !== requiredKeys.length
  ) {
    throw new Error("manifest_shared_experience_rejected");
  }
  for (const key of requiredKeys) {
    if (!ACCEPTANCE_STATUSES.includes(sharedExperience[key])) {
      throw new Error(`manifest_shared_experience_rejected:${key}`);
    }
  }
}

function assertSafeManifestValue(value, path = "manifest") {
  if (typeof value === "string") {
    if (
      /(?:eyJ[a-zA-Z0-9_-]{8,}\.|bearer\s+|sb_(?:secret|publishable)_|service[_-]?role[_-]?key)/iu.test(
        value
      )
    ) {
      throw new Error(`manifest_secret_rejected:${path}`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (/(?:authorization|bearer|jwt|password|secret|access.?token|service.?role.?key)/iu.test(key)) {
      throw new Error(`manifest_secret_key_rejected:${path}.${key}`);
    }
    assertSafeManifestValue(child, `${path}.${key}`);
  }
}

function nullableNonNegativeInteger(value) {
  return value === null || (Number.isInteger(value) && value >= 0);
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  );
}

function isRunScopedStoragePath(resource, runMarker) {
  return (
    resource.kind === "storage-object" &&
    typeof resource.id === "string" &&
    resource.id.startsWith(`${runMarker}/`) &&
    !resource.id.includes("..") &&
    !resource.id.includes("\\")
  );
}

function isPngSignature(header) {
  return header.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
}

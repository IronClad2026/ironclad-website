import { createHash } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APPROVED_APPLICATION_TREE,
  APPROVED_RELEASE_SOURCE_HEAD,
  APPROVED_TOOLING_BASE_HEAD,
  AUTHORIZED_TOOLING_PATHS,
  BACKFILL_BATCH_SIZE,
  BACKFILL_TARGETS,
  BadgeBackfillCutoverError,
  PINNED_RUNTIME_MODULE_PATHS,
  aggregateBackfillResults,
  buildCommandEnvironment,
  buildDatabaseAttestationSql,
  canonicalizePlayerIds,
  deriveHistoricalExecutionSet,
  diffAwardRows,
  hashPlayerIds,
  parseAllowlistDocument,
  parseArguments,
  readAllowlistFile,
  runBatchedBackfill,
  sanitizeFailure,
  validateBackfillPass,
  validateBaseUrl,
  validateHistoricalAwardDelta,
  validateLoadedAuthority,
  validateNewAwardMetadata,
  validateOptions,
  validateRuntimeEnvironment,
} from "../../scripts/badges/initial-awards-backfill.mjs";

const STAGING_REF = BACKFILL_TARGETS.staging.ref;
const PRODUCTION_REF = BACKFILL_TARGETS.production.ref;
const EXPECTED_TOOLING_HEAD = "a".repeat(40);
const EXPECTED_STAGING_HEAD = "c".repeat(40);
const EXPECTED_PRODUCTION_HEAD = "d".repeat(40);
const FILE_SHA256 = "b".repeat(64);
const PLAYER_IDS = Array.from(
  { length: BACKFILL_BATCH_SIZE + 1 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
);
const PLAYER_ID = PLAYER_IDS[0];
const LIVE_PLAYER_ID = PLAYER_IDS[1];
const AWARD_ID = "10000000-0000-4000-8000-000000000001";
const LIVE_AWARD_ID = "20000000-0000-4000-8000-000000000001";
const LIVE_NOTIFICATION_ID = "30000000-0000-4000-8000-000000000001";
const LIVE_REVEAL_ID = "40000000-0000-4000-8000-000000000001";
const EXECUTION_SET_SHA256 = hashPlayerIds([PLAYER_ID]);

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("initial Badge backfill CLI guards", () => {
  it("parses only the fixed explicit arguments and keeps apply opt-in", () => {
    expect(
      parseArguments([
        "--target",
        "production",
        "--confirm-project-ref",
        PRODUCTION_REF,
        "--base-url",
        "https://www.ironcladtournaments.com",
        "--expected-production-head",
        EXPECTED_PRODUCTION_HEAD,
        "--expected-tooling-head",
        EXPECTED_TOOLING_HEAD,
        "--allowlist-file",
        "C:\\private\\badge-backfill.json",
        "--allowlist-sha256",
        FILE_SHA256,
        "--expected-live-award-id",
        LIVE_AWARD_ID,
        "--expected-live-notification-id",
        LIVE_NOTIFICATION_ID,
        "--expected-live-reveal-id",
        LIVE_REVEAL_ID,
        "--expected-execution-count",
        "1",
        "--expected-execution-set-sha256",
        EXECUTION_SET_SHA256,
      ])
    ).toMatchObject({
      apply: false,
      expectedProductionHead: EXPECTED_PRODUCTION_HEAD,
      expectedStagingHead: null,
      expectedToolingHead: EXPECTED_TOOLING_HEAD,
      expectedLiveAwardId: LIVE_AWARD_ID,
      expectedLiveNotificationId: LIVE_NOTIFICATION_ID,
      expectedLiveRevealId: LIVE_REVEAL_ID,
      expectedExecutionCount: "1",
      expectedExecutionSetSha256: EXECUTION_SET_SHA256,
      target: "production",
    });

    expect(
      parseArguments([
        "--target",
        "staging",
        "--expected-staging-head",
        EXPECTED_STAGING_HEAD,
        "--apply",
      ])
    ).toMatchObject({
      apply: true,
      expectedProductionHead: null,
      expectedStagingHead: EXPECTED_STAGING_HEAD,
      target: "staging",
    });

    expectCutoverError(
      () => parseArguments(["--target", "staging", "--apply", "--apply"]),
      "ARGUMENT_DUPLICATE"
    );
    expectCutoverError(
      () => parseArguments(["--target"]),
      "ARGUMENT_VALUE_MISSING"
    );
    expectCutoverError(
      () => parseArguments(["--mutate"]),
      "ARGUMENT_UNKNOWN"
    );
  });

  it("requires the collision-aware Production arguments all-or-none", () => {
    const production = validOptions("production");

    expect(validateOptions(production)).toMatchObject({
      collisionBaseline: {
        awardId: LIVE_AWARD_ID,
        executionCount: 1,
        executionSetSha256: EXECUTION_SET_SHA256,
        notificationId: LIVE_NOTIFICATION_ID,
        revealId: LIVE_REVEAL_ID,
      },
    });

    for (const key of [
      "expectedLiveAwardId",
      "expectedLiveNotificationId",
      "expectedLiveRevealId",
      "expectedExecutionCount",
      "expectedExecutionSetSha256",
    ] as const) {
      expectCutoverError(
        () => validateOptions({ ...production, [key]: null }),
        "LIVE_BASELINE_ARGUMENTS_PARTIAL"
      );
    }

    expectCutoverError(
      () =>
        validateOptions({
          ...production,
          expectedExecutionCount: null,
          expectedExecutionSetSha256: null,
          expectedLiveAwardId: null,
          expectedLiveNotificationId: null,
          expectedLiveRevealId: null,
        }),
      "PRODUCTION_LIVE_BASELINE_REQUIRED"
    );
    expectCutoverError(
      () =>
        validateOptions({
          ...validOptions("staging"),
          expectedExecutionCount: "1",
          expectedExecutionSetSha256: EXECUTION_SET_SHA256,
          expectedLiveAwardId: LIVE_AWARD_ID,
          expectedLiveNotificationId: LIVE_NOTIFICATION_ID,
          expectedLiveRevealId: LIVE_REVEAL_ID,
        }),
      "STAGING_LIVE_BASELINE_UNEXPECTED"
    );
  });

  it.each([
    ["expectedLiveAwardId", "not-a-uuid", "EXPECTED_LIVE_AWARD_ID_INVALID"],
    [
      "expectedLiveNotificationId",
      "not-a-uuid",
      "EXPECTED_LIVE_NOTIFICATION_ID_INVALID",
    ],
    ["expectedLiveRevealId", "not-a-uuid", "EXPECTED_LIVE_REVEAL_ID_INVALID"],
    ["expectedExecutionCount", 0, "EXPECTED_EXECUTION_COUNT_INVALID"],
    ["expectedExecutionCount", "2", "EXPECTED_EXECUTION_COUNT_INVALID"],
    [
      "expectedExecutionSetSha256",
      "not-a-hash",
      "EXPECTED_EXECUTION_SET_SHA256_INVALID",
    ],
  ] as const)("rejects invalid collision option %s", (key, value, code) => {
    expectCutoverError(
      () => validateOptions({ ...validOptions("production"), [key]: value }),
      code
    );
  });

  it("hard-binds the target, project ref, deployment origin, target/tooling heads, and hash", () => {
    const production = validOptions("production");
    expect(validateOptions(production)).toMatchObject({
      baseUrl: "https://www.ironcladtournaments.com",
      expectedProductionHead: EXPECTED_PRODUCTION_HEAD,
      expectedStagingHead: null,
      expectedToolingHead: EXPECTED_TOOLING_HEAD,
      targetConfig: BACKFILL_TARGETS.production,
    });

    expectCutoverError(
      () =>
        validateOptions({
          ...production,
          confirmProjectRef: STAGING_REF,
        }),
      "PROJECT_CONFIRMATION_MISMATCH"
    );
    expectCutoverError(
      () =>
        validateOptions({ ...production, expectedProductionHead: "main" }),
      "EXPECTED_PRODUCTION_HEAD_INVALID"
    );
    expectCutoverError(
      () => validateOptions({ ...production, expectedProductionHead: null }),
      "EXPECTED_PRODUCTION_HEAD_INVALID"
    );
    expectCutoverError(
      () => validateOptions({ ...production, expectedToolingHead: "main" }),
      "EXPECTED_TOOLING_HEAD_INVALID"
    );
    expectCutoverError(
      () =>
        validateOptions({
          ...production,
          expectedStagingHead: EXPECTED_STAGING_HEAD,
        }),
      "EXPECTED_STAGING_HEAD_UNEXPECTED"
    );
    expectCutoverError(
      () => validateOptions({ ...production, allowlistSha256: "ABC" }),
      "ALLOWLIST_FILE_SHA256_INVALID"
    );
    expectCutoverError(
      () =>
        validateBaseUrl(
          "https://ironclad-preview.vercel.app",
          "production"
        ),
      "PRODUCTION_BASE_URL_MISMATCH"
    );
    expectCutoverError(
      () => validateBaseUrl("https://example.com", "staging"),
      "STAGING_DEPLOYMENT_URL_INVALID"
    );
    expectCutoverError(
      () =>
        validateBaseUrl(
          "https://ironclad-preview.vercel.app/path",
          "staging"
        ),
      "BASE_URL_INVALID"
    );

    const staging = validOptions("staging");
    expect(
      validateOptions(staging)
    ).toMatchObject({
      expectedProductionHead: null,
      expectedStagingHead: EXPECTED_STAGING_HEAD,
      expectedToolingHead: EXPECTED_TOOLING_HEAD,
    });
    expectCutoverError(
      () => validateOptions({ ...staging, expectedStagingHead: null }),
      "EXPECTED_STAGING_HEAD_INVALID"
    );
    expectCutoverError(
      () =>
        validateOptions({
          ...staging,
          expectedProductionHead: EXPECTED_PRODUCTION_HEAD,
        }),
      "EXPECTED_PRODUCTION_HEAD_UNEXPECTED"
    );
  });

  it("pins the release source/tree, tooling base, exact four-file diff, and critical runtime modules", () => {
    expect(APPROVED_RELEASE_SOURCE_HEAD).toBe(
      "ac612018f6c27963a59df84815d0a76ebbcbd27e"
    );
    expect(APPROVED_APPLICATION_TREE).toBe(
      "6ba0e3b2308bd22c3c9dea62efb235f1bb48326c"
    );
    expect(APPROVED_TOOLING_BASE_HEAD).toBe(APPROVED_RELEASE_SOURCE_HEAD);
    expect(EXPECTED_PRODUCTION_HEAD).not.toBe(APPROVED_RELEASE_SOURCE_HEAD);
    expect(AUTHORIZED_TOOLING_PATHS).toEqual([
      "docs/achievement-badge-production-cutover-runbook.md",
      "scripts/badges/initial-awards-backfill.mjs",
      "tests/integration/badge-initial-backfill-contract.test.ts",
      "tests/unit/badge-initial-backfill-cli.test.ts",
    ]);
    expect(PINNED_RUNTIME_MODULE_PATHS).toEqual([
      "lib/badge-notifications.ts",
      "lib/badges/authority.ts",
      "lib/badges/reconciliation.ts",
      "lib/badges/reveals.ts",
      "lib/supabase-admin.ts",
    ]);
    expect(
      PINNED_RUNTIME_MODULE_PATHS.some((path) =>
        AUTHORIZED_TOOLING_PATHS.includes(path)
      )
    ).toBe(false);
  });

  it("requires an exact raw-file hash and a canonical private allowlist", () => {
    const directory = mkdtempSync(join(tmpdir(), "badge-backfill-allowlist-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "production.json");
    const document = JSON.stringify(
      {
        schemaVersion: 1,
        target: "production",
        projectRef: PRODUCTION_REF,
        playerIds: PLAYER_IDS.slice(0, 2),
      },
      null,
      2
    );
    writeFileSync(path, document, "utf8");
    const rawFileSha256 = createHash("sha256")
      .update(Buffer.from(document, "utf8"))
      .digest("hex");

    expect(
      readAllowlistFile(
        path,
        {
          fileSha256: rawFileSha256,
          projectRef: PRODUCTION_REF,
          target: "production",
        },
        process.cwd()
      )
    ).toEqual({
      fileSha256: rawFileSha256,
      playerIds: PLAYER_IDS.slice(0, 2),
      playerIdsSha256: hashPlayerIds(PLAYER_IDS.slice(0, 2)),
    });

    expectCutoverError(
      () =>
        readAllowlistFile(
          path,
          {
            fileSha256: "0".repeat(64),
            projectRef: PRODUCTION_REF,
            target: "production",
          },
          process.cwd()
        ),
      "ALLOWLIST_FILE_HASH_MISMATCH"
    );

    const reversed = [...PLAYER_IDS.slice(0, 2)].reverse();
    expectCutoverError(
      () =>
        parseAllowlistDocument(
          JSON.stringify({
            schemaVersion: 1,
            target: "production",
            projectRef: PRODUCTION_REF,
            playerIds: reversed,
          }),
          { projectRef: PRODUCTION_REF, target: "production" }
        ),
      "ALLOWLIST_PLAYER_IDS_NOT_CANONICAL"
    );
    expectCutoverError(
      () => canonicalizePlayerIds([PLAYER_ID, PLAYER_ID]),
      "ALLOWLIST_PLAYER_ID_DUPLICATE"
    );
  });

  it("derives and pins the historical execution set from the full cohort", () => {
    const fullCohort = [PLAYER_ID, LIVE_PLAYER_ID];

    expect(
      deriveHistoricalExecutionSet(fullCohort, LIVE_PLAYER_ID, {
        expectedCount: 1,
        expectedSha256: EXECUTION_SET_SHA256,
      })
    ).toEqual({
      playerIds: [PLAYER_ID],
      playerIdsSha256: EXECUTION_SET_SHA256,
    });

    expectCutoverError(
      () =>
        deriveHistoricalExecutionSet(fullCohort, LIVE_PLAYER_ID, {
          expectedCount: 2,
          expectedSha256: EXECUTION_SET_SHA256,
        }),
      "HISTORICAL_EXECUTION_COUNT_MISMATCH"
    );
    expectCutoverError(
      () =>
        deriveHistoricalExecutionSet(fullCohort, LIVE_PLAYER_ID, {
          expectedCount: 1,
          expectedSha256: "f".repeat(64),
        }),
      "HISTORICAL_EXECUTION_SET_SHA256_MISMATCH"
    );
  });

  it("requires the exact target URL and a non-expired service-role JWT", () => {
    const validEnvironment = runtimeEnvironment(STAGING_REF);
    expect(
      validateRuntimeEnvironment(
        validEnvironment,
        BACKFILL_TARGETS.staging,
        Date.parse("2026-09-01T00:00:00.000Z")
      )
    ).toMatchObject({
      supabaseUrl: `https://${STAGING_REF}.supabase.co`,
      serviceRoleKey: validEnvironment.SUPABASE_SERVICE_ROLE_KEY,
    });

    expectCutoverError(
      () =>
        validateRuntimeEnvironment(
          {
            ...validEnvironment,
            NEXT_PUBLIC_SUPABASE_URL:
              `https://${PRODUCTION_REF}.supabase.co`,
          },
          BACKFILL_TARGETS.staging
        ),
      "SUPABASE_PROJECT_URL_MISMATCH"
    );
    expectCutoverError(
      () =>
        validateRuntimeEnvironment(
          {
            ...validEnvironment,
            SUPABASE_SERVICE_ROLE_KEY: jwt({
              iss: "supabase",
              ref: PRODUCTION_REF,
              role: "service_role",
            }),
          },
          BACKFILL_TARGETS.staging
        ),
      "SERVICE_ROLE_PROJECT_MISMATCH"
    );
    expectCutoverError(
      () =>
        validateRuntimeEnvironment(
          {
            ...validEnvironment,
            SUPABASE_SERVICE_ROLE_KEY: jwt({
              iss: "supabase",
              ref: STAGING_REF,
              role: "authenticated",
            }),
          },
          BACKFILL_TARGETS.staging
        ),
      "SERVICE_ROLE_PROJECT_MISMATCH"
    );
    expectCutoverError(
      () =>
        validateRuntimeEnvironment(
          {
            ...validEnvironment,
            SUPABASE_SERVICE_ROLE_KEY: jwt({
              iss: "unexpected-issuer",
              ref: STAGING_REF,
              role: "service_role",
            }),
          },
          BACKFILL_TARGETS.staging
        ),
      "SERVICE_ROLE_PROJECT_MISMATCH"
    );
    expectCutoverError(
      () =>
        validateRuntimeEnvironment(
          {
            ...validEnvironment,
            SUPABASE_SERVICE_ROLE_KEY: "not-a-jwt",
          },
          BACKFILL_TARGETS.staging
        ),
      "SERVICE_ROLE_JWT_INVALID"
    );
    expectCutoverError(
      () =>
        validateRuntimeEnvironment(
          {
            ...validEnvironment,
            SUPABASE_SERVICE_ROLE_KEY: jwt({
              exp: 1,
              iss: "supabase",
              ref: STAGING_REF,
              role: "service_role",
            }),
          },
          BACKFILL_TARGETS.staging,
          2_000
        ),
      "SERVICE_ROLE_PROJECT_MISMATCH"
    );
  });

  it("builds a read-only, rollback-scoped database attestation", () => {
    const sql = buildDatabaseAttestationSql([PLAYER_ID]);

    expect(sql).toContain(
      "begin transaction isolation level repeatable read read only;"
    );
    expect(sql).toContain("where player.account_closed_at is null");
    expect(sql).toContain("ironclad_private.staging_synthetic_uat_players");
    expect(sql).toContain("legitimate_open_candidates");
    expect(sql).toContain("candidate_player_count");
    expect(sql).toContain("legitimate_open_allowlist_player_count");
    expect(sql).not.toContain("player_badge_awards");
    expect(sql).toContain("rollback;");
    expect(sql).not.toMatch(/\b(?:insert|update|delete|truncate|alter|drop)\b/iu);
  });

  it("strips application credentials and ambient Git controls from spawned CLI environments", () => {
    expect(
      buildCommandEnvironment({
        CLERK_SECRET_KEY: "clerk-secret",
        DATABASE_URL: "postgres://private",
        GIT_CONFIG_COUNT: "1",
        GIT_DIR: "C:\\spoofed-git-dir",
        GIT_NO_REPLACE_OBJECTS: "0",
        GIT_REPLACE_REF_BASE: "refs/spoofed/",
        GIT_WORK_TREE: "C:\\spoofed-work-tree",
        NORMAL_SETTING: "retained",
        OPENAI_API_KEY: "api-secret",
        PATH: "C:\\tools",
        SUPABASE_ACCESS_TOKEN: "supabase-cli-auth",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
        VERCEL_OIDC_TOKEN: "vercel-oidc-auth",
        VERCEL_TOKEN: "vercel-cli-auth",
      })
    ).toEqual({
      GIT_NO_REPLACE_OBJECTS: "1",
      NORMAL_SETTING: "retained",
      PATH: "C:\\tools",
      SUPABASE_ACCESS_TOKEN: "supabase-cli-auth",
      VERCEL_OIDC_TOKEN: "vercel-oidc-auth",
      VERCEL_TOKEN: "vercel-cli-auth",
    });
  });

  it("requires the deployed authority export without invoking it", () => {
    const backfillInitialBadgeAwards = vi.fn();
    const server = { close: vi.fn() };

    expect(
      validateLoadedAuthority({ backfillInitialBadgeAwards, server })
    ).toEqual({ backfillInitialBadgeAwards, server });
    expect(backfillInitialBadgeAwards).not.toHaveBeenCalled();
    expectCutoverError(
      () => validateLoadedAuthority({ backfillInitialBadgeAwards: null, server }),
      "BACKFILL_AUTHORITY_EXPORT_INVALID"
    );
  });
});

describe("initial Badge backfill result contracts", () => {
  it("batches only explicit player IDs into the existing backfill authority", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() };
    const backfillInitialBadgeAwards = vi.fn(async ({ playerIds }) => ({
      awardsCreated: 0,
      badgeCounts: { "ironclad-recruit": 0 },
      errors: [],
      playersEvaluated: playerIds.length,
    }));

    await runBatchedBackfill({
      backfillInitialBadgeAwards,
      playerIds: PLAYER_IDS,
      supabase,
    });

    expect(backfillInitialBadgeAwards).toHaveBeenCalledTimes(2);
    expect(backfillInitialBadgeAwards.mock.calls[0][0]).toEqual({
      playerIds: PLAYER_IDS.slice(0, BACKFILL_BATCH_SIZE),
      supabase,
    });
    expect(backfillInitialBadgeAwards.mock.calls[1][0]).toEqual({
      playerIds: PLAYER_IDS.slice(BACKFILL_BATCH_SIZE),
      supabase,
    });
  });

  it("stops after an errored batch while preserving its completed result", async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() };
    const retainedAwardIds: string[] = [];
    const failedBatch = {
      awardsCreated: 1,
      badgeCounts: { "ironclad-recruit": 1 },
      errors: [{ code: "MATCH_SUMMARY_LOAD_FAILED", playerId: PLAYER_ID }],
      playersEvaluated: BACKFILL_BATCH_SIZE,
    };
    const backfillInitialBadgeAwards = vi
      .fn()
      .mockImplementationOnce(async () => {
        retainedAwardIds.push(AWARD_ID);
        return failedBatch;
      })
      .mockImplementationOnce(async () => ({
        awardsCreated: 0,
        badgeCounts: { "ironclad-recruit": 0 },
        errors: [],
        playersEvaluated: 1,
      }));

    const results = await runBatchedBackfill({
      backfillInitialBadgeAwards,
      playerIds: PLAYER_IDS,
      supabase,
    });

    expect(backfillInitialBadgeAwards).toHaveBeenCalledOnce();
    expect(results).toEqual([failedBatch]);
    expect(retainedAwardIds).toEqual([AWARD_ID]);
    expect(aggregateBackfillResults(results)).toMatchObject({
      awardsCreated: 1,
      errorCount: 1,
      errorsByCode: { MATCH_SUMMARY_LOAD_FAILED: 1 },
      playersEvaluated: BACKFILL_BATCH_SIZE,
    });
  });

  it("sanitizes player-level failures down to aggregate codes and counts", () => {
    const result = aggregateBackfillResults([
      {
        awardsCreated: 0,
        badgeCounts: { "ironclad-recruit": 0 },
        errors: [
          {
            playerId: PLAYER_ID,
            code: "private failure: player details",
          },
        ],
        playersEvaluated: 1,
      },
    ]);

    expect(result).toEqual({
      awardsCreated: 0,
      badgeCounts: { "ironclad-recruit": 0 },
      errorCount: 1,
      errorsByCode: { BADGE_BACKFILL_FAILED: 1 },
      playersEvaluated: 1,
    });
    expect(JSON.stringify(result)).not.toContain(PLAYER_ID);
    expect(
      sanitizeFailure(
        new Error(`private failure for ${PLAYER_ID}`),
        { apply: true, target: "production" }
      )
    ).toEqual({
      code: "BADGE_BACKFILL_UNEXPECTED_FAILURE",
      ok: false,
      productionMutationMayHaveOccurred: true,
    });
  });

  it("fails closed on partial errors, observed-delta mismatch, or nonzero rerun", () => {
    const validPass = {
      awardsCreated: 1,
      badgeCounts: { "ironclad-recruit": 1 },
      errorCount: 0,
      errorsByCode: {},
      playersEvaluated: 1,
    };

    expect(
      validateBackfillPass(validPass, {
        expectedNewAwards: 1,
        expectedPlayers: 1,
        requireZero: false,
      })
    ).toBe(validPass);

    expectCutoverError(
      () =>
        validateBackfillPass(
          { ...validPass, errorCount: 1 },
          {
            expectedNewAwards: 1,
            expectedPlayers: 1,
            requireZero: false,
          }
        ),
      "BACKFILL_PASS_FAILED"
    );
    expectCutoverError(
      () =>
        validateBackfillPass(validPass, {
          expectedNewAwards: 2,
          expectedPlayers: 1,
          requireZero: false,
        }),
      "BACKFILL_PASS_FAILED"
    );
    expectCutoverError(
      () =>
        validateBackfillPass(validPass, {
          expectedNewAwards: 1,
          expectedPlayers: 1,
          requireZero: true,
        }),
      "IDEMPOTENCY_PASS_FAILED"
    );
  });

  it("requires immutable existing awards and backfill metadata on every delta row", () => {
    const backfillAward = awardRow(AWARD_ID, "backfill");
    expect(diffAwardRows([], [backfillAward])).toEqual([backfillAward]);
    expect(validateNewAwardMetadata([backfillAward])).toBe(true);

    expectCutoverError(
      () => validateNewAwardMetadata([awardRow(AWARD_ID, "reconciliation")]),
      "NEW_AWARD_EVALUATION_MODE_MISMATCH"
    );
    expectCutoverError(
      () =>
        diffAwardRows(
          [backfillAward],
          [{ ...backfillAward, badge_slug: "first-victory" }]
        ),
      "EXISTING_AWARD_CHANGED_DURING_BACKFILL"
    );
  });

  it("pins the sole historical delta to Recruit/profile/backfill for the execution player", () => {
    const expected = awardRow(AWARD_ID, "backfill");

    expect(validateHistoricalAwardDelta([expected], [PLAYER_ID])).toBe(true);

    for (const row of [
      { ...expected, player_id: LIVE_PLAYER_ID },
      { ...expected, badge_slug: "first-victory" },
      { ...expected, source_type: "match" },
      { ...expected, source_id: LIVE_PLAYER_ID },
      { ...expected, source_metadata: { evaluationMode: "live" } },
    ]) {
      expectCutoverError(
        () => validateHistoricalAwardDelta([row], [PLAYER_ID]),
        "HISTORICAL_AWARD_DELTA_MISMATCH"
      );
    }
  });
});

function validOptions(target: "staging" | "production") {
  return {
    allowlistFile: "C:\\private\\badge-backfill.json",
    allowlistSha256: FILE_SHA256,
    apply: false,
    baseUrl:
      target === "production"
        ? "https://www.ironcladtournaments.com"
        : "https://ironclad-preview.vercel.app",
    confirmProjectRef:
      target === "production" ? PRODUCTION_REF : STAGING_REF,
    expectedProductionHead:
      target === "production" ? EXPECTED_PRODUCTION_HEAD : null,
    expectedStagingHead:
      target === "staging" ? EXPECTED_STAGING_HEAD : null,
    expectedToolingHead: EXPECTED_TOOLING_HEAD,
    expectedLiveAwardId: target === "production" ? LIVE_AWARD_ID : null,
    expectedLiveNotificationId:
      target === "production" ? LIVE_NOTIFICATION_ID : null,
    expectedLiveRevealId: target === "production" ? LIVE_REVEAL_ID : null,
    expectedExecutionCount: target === "production" ? "1" : null,
    expectedExecutionSetSha256:
      target === "production" ? EXECUTION_SET_SHA256 : null,
    help: false,
    target,
  };
}

function runtimeEnvironment(projectRef: string) {
  return {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: jwt({
      exp: 2_000_000_000,
      iss: "supabase",
      ref: projectRef,
      role: "service_role",
    }),
  };
}

function jwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${header}.${encodedPayload}.test-signature`;
}

function awardRow(id: string, evaluationMode: string) {
  return {
    badge_slug: "ironclad-recruit",
    id,
    player_id: PLAYER_ID,
    source_id: PLAYER_ID,
    source_metadata: { evaluationMode },
    source_type: "profile",
  };
}

function expectCutoverError(action: () => unknown, code: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BadgeBackfillCutoverError);
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`Expected BadgeBackfillCutoverError ${code}.`);
}

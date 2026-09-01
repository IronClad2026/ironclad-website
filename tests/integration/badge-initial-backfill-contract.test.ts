import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APPROVED_APPLICATION_HEAD,
  APPROVED_TOOLING_BASE_HEAD,
  AUTHORIZED_TOOLING_PATHS,
  BACKFILL_TARGETS,
  PINNED_RUNTIME_MODULE_PATHS,
  hashPlayerIds,
  runInitialAwardsBackfill,
  sanitizeFailure,
} from "../../scripts/badges/initial-awards-backfill.mjs";

const STAGING_REF = BACKFILL_TARGETS.staging.ref;
const PRODUCTION_REF = BACKFILL_TARGETS.production.ref;
const EXPECTED_APPLICATION_HEAD = APPROVED_APPLICATION_HEAD;
const EXPECTED_TOOLING_HEAD = "a".repeat(40);
const BASE_URL = "https://ironclad-backfill-preview.vercel.app";
const PLAYER_ID = "00000000-0000-4000-8000-000000000001";
const FIRST_AWARD_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_AWARD_ID = "10000000-0000-4000-8000-000000000002";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("initial Badge backfill orchestration contract", () => {
  it("keeps the default preflight read-only, validates the export, and returns ID-free evidence", async () => {
    const harness = createHarness({ apply: false });

    const result = await runInitialAwardsBackfill(harness.options, harness.deps);

    expect(result).toMatchObject({
      code: "BADGE_BACKFILL_PREFLIGHT_READY",
      mode: "preflight",
      ok: true,
      target: "staging",
      expectedApplicationHead: EXPECTED_APPLICATION_HEAD,
      expectedToolingHead: EXPECTED_TOOLING_HEAD,
      toolingBaseHead: APPROVED_TOOLING_BASE_HEAD,
      allowlist: {
        count: 1,
        fileSha256: harness.fileSha256,
        playerIdsSha256: hashPlayerIds([PLAYER_ID]),
      },
      before: { awardCount: 0 },
      authority: {
        envFile: false,
        exportVerified: true,
        loader: "vite-ssr",
      },
      firstPass: null,
      secondPass: null,
      postconditions: null,
    });
    expect(harness.authorityLoader).toHaveBeenCalledOnce();
    expect(harness.backfillInitialBadgeAwards).not.toHaveBeenCalled();
    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(harness.client.from.mock.calls.map(([table]) => table)).toEqual([
      "players",
      "player_badge_awards",
    ]);
    expect(JSON.stringify(result)).not.toContain(PLAYER_ID);
    expect(JSON.stringify(result)).not.toContain(harness.allowlistPath);
  });

  it("rejects a deployed application SHA that differs from the reviewed application", async () => {
    const harness = createHarness({
      apply: false,
      commandOutputs: {
        VERCEL_DEPLOYMENT_METADATA_FAILED: JSON.stringify({
          gitSource: { sha: "f".repeat(40) },
          id: "dpl_BadgeBackfillTest",
          readyState: "READY",
          target: null,
        }),
      },
    });

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({ code: "VERCEL_DEPLOYMENT_HEAD_MISMATCH" });
    expect(harness.authorityLoader).not.toHaveBeenCalled();
    expect(harness.backfillInitialBadgeAwards).not.toHaveBeenCalled();
  });

  it.each([
    {
      code: "GIT_TOOLING_HEAD_MISMATCH",
      failureCode: "GIT_HEAD_LOAD_FAILED",
      name: "a wrong local tooling SHA",
      output: `${"f".repeat(40)}\n`,
    },
    {
      code: "GIT_WORKTREE_DIRTY",
      failureCode: "GIT_STATUS_LOAD_FAILED",
      name: "a dirty worktree",
      output: " M scripts/badges/initial-awards-backfill.mjs\n",
    },
    {
      code: "GIT_TOOLING_BASE_MISMATCH",
      failureCode: "GIT_TOOLING_BASE_LOAD_FAILED",
      name: "a tooling branch outside the approved base lineage",
      output: `${"f".repeat(40)}\n`,
    },
    {
      code: "GIT_TOOLING_DIFF_MISMATCH",
      failureCode: "GIT_TOOLING_DIFF_LOAD_FAILED",
      name: "an unauthorized transitive runtime diff",
      output: `${[
        ...AUTHORIZED_TOOLING_PATHS,
        "lib/notifications.ts",
      ].join("\n")}\n`,
    },
  ])("fails closed before remote checks for $name", async (scenario) => {
    const harness = createHarness({
      apply: false,
      commandOutputs: { [scenario.failureCode]: scenario.output },
    });

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({ code: scenario.code });
    expect(harness.authorityLoader).not.toHaveBeenCalled();
    expect(harness.backfillInitialBadgeAwards).not.toHaveBeenCalled();
    expect(
      harness.commandRunner.mock.calls.some(
        ([, , , failureCode]) => failureCode === "SUPABASE_PROJECT_LIST_FAILED"
      )
    ).toBe(false);
  });

  it.each(PINNED_RUNTIME_MODULE_PATHS)(
    "rejects changed bytes for pinned runtime module %s",
    async (runtimePath) => {
      const harness = createHarness({
        apply: false,
        commandOutputs: {
          GIT_RUNTIME_MODULE_DIFF_LOAD_FAILED: `${runtimePath}\n`,
        },
      });

      await expect(
        runInitialAwardsBackfill(harness.options, harness.deps)
      ).rejects.toMatchObject({ code: "GIT_RUNTIME_MODULE_MISMATCH" });
      expect(harness.authorityLoader).not.toHaveBeenCalled();

      const runtimeDiffCall = harness.commandRunner.mock.calls.find(
        ([, , , failureCode]) =>
          failureCode === "GIT_RUNTIME_MODULE_DIFF_LOAD_FAILED"
      );
      expect(runtimeDiffCall?.[1]).toEqual([
        "diff",
        "--name-only",
        "--no-renames",
        `${APPROVED_TOOLING_BASE_HEAD}..${EXPECTED_TOOLING_HEAD}`,
        "--",
        ...PINNED_RUNTIME_MODULE_PATHS,
      ]);
    }
  );

  it.each([
    {
      name: "closed or missing",
      override: {
        allowlist_closed_or_missing_count: 1,
        legitimate_open_allowlist_player_count: 0,
      },
    },
    {
      name: "synthetic",
      override: {
        allowlist_synthetic_overlap_count: 1,
        legitimate_open_allowlist_player_count: 0,
      },
    },
  ])("rejects a $name allowlisted candidate", async ({ override }) => {
    const harness = createHarness({
      apply: false,
      databaseAttestationOverrides: [override],
    });

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({
      code: "ALLOWLIST_DATABASE_ATTESTATION_MISMATCH",
    });
    expect(harness.authorityLoader).not.toHaveBeenCalled();
    expect(harness.backfillInitialBadgeAwards).not.toHaveBeenCalled();
  });

  it("permits excluded global open rows when the Production candidate set still matches", async () => {
    const harness = createHarness({
      apply: false,
      databaseAttestationOverrides: [
        {
          open_player_count: 3,
          open_player_sha256: "d".repeat(64),
          synthetic_open_player_count: 1,
          unavailable_identity_open_player_count: 1,
        },
      ],
      target: "production",
    });

    const result = await runInitialAwardsBackfill(
      harness.options,
      harness.deps
    );

    expect(result.databaseAttestation).toMatchObject({
      allAllowlistedPlayersLegitimateOpen: true,
      candidateHashMatches: true,
      candidatePlayerCount: 1,
      globalOpenCount: 3,
      syntheticOpenPlayerCount: 1,
      unavailableIdentityOpenPlayerCount: 1,
    });
  });

  it("rejects a Production candidate population that differs from the frozen allowlist", async () => {
    const harness = createHarness({
      apply: false,
      databaseAttestationOverrides: [
        {
          candidate_player_count: 0,
          candidate_player_sha256: hashPlayerIds([]),
        },
      ],
      target: "production",
    });

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({
      code: "PRODUCTION_CANDIDATE_ATTESTATION_MISMATCH",
    });
    expect(harness.authorityLoader).not.toHaveBeenCalled();
  });

  it.each([
    ["notification", 1, 0],
    ["reveal", 0, 1],
  ])(
    "fails before authority load when a retained backfill %s side effect exists",
    async (_, notificationCount, revealCount) => {
      const harness = createHarness({
        apply: false,
        notificationCount,
        revealCount,
      });
      harness.state.awards.push(awardRow(FIRST_AWARD_ID, "backfill"));

      await expect(
        runInitialAwardsBackfill(harness.options, harness.deps)
      ).rejects.toMatchObject({
        code: "EXISTING_BACKFILL_POSTCONDITION_FAILED",
        details: {
          matchingNotifications: notificationCount,
          matchingReveals: revealCount,
          retainedBackfillAwards: 1,
        },
      });
      expect(harness.authorityLoader).not.toHaveBeenCalled();
      expect(harness.backfillInitialBadgeAwards).not.toHaveBeenCalled();
    }
  );

  it("rejects any non-backfill award in the initial Production baseline", async () => {
    const harness = createHarness({ apply: false, target: "production" });
    harness.state.awards.push(awardRow(FIRST_AWARD_ID, "live"));

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({
      code: "PRODUCTION_BASELINE_AWARD_MODE_MISMATCH",
      details: {
        baselineAwardCount: 1,
        nonBackfillAwardCount: 1,
      },
    });
    expect(harness.authorityLoader).not.toHaveBeenCalled();
    expect(harness.backfillInitialBadgeAwards).not.toHaveBeenCalled();
  });

  it("closes the preflight loader when the deployed authority export is invalid", async () => {
    const harness = createHarness({ apply: false });
    const invalidAuthorityLoader = vi.fn(async () => ({
      backfillInitialBadgeAwards: null,
      server: harness.server,
    }));

    await expect(
      runInitialAwardsBackfill(harness.options, {
        ...harness.deps,
        authorityLoader:
          invalidAuthorityLoader as unknown as typeof import("../../scripts/badges/initial-awards-backfill.mjs").loadBadgeAuthority,
      })
    ).rejects.toMatchObject({ code: "BACKFILL_AUTHORITY_EXPORT_INVALID" });
    expect(invalidAuthorityLoader).toHaveBeenCalledOnce();
    expect(harness.server.close).toHaveBeenCalledOnce();
  });

  it("runs the same explicit batch twice and accepts only a zero second pass", async () => {
    const harness = createHarness({ apply: true });
    harness.backfillInitialBadgeAwards
      .mockImplementationOnce(async (input: BackfillInput) => {
        expect(input).toEqual({
          playerIds: [PLAYER_ID],
          supabase: harness.client,
        });
        harness.state.awards.push(awardRow(FIRST_AWARD_ID, "backfill"));
        return backfillResult({ awardsCreated: 1 });
      })
      .mockImplementationOnce(async (input: BackfillInput) => {
        expect(input).toEqual({
          playerIds: [PLAYER_ID],
          supabase: harness.client,
        });
        return backfillResult({ awardsCreated: 0 });
      });

    const result = await runInitialAwardsBackfill(harness.options, harness.deps);

    expect(harness.backfillInitialBadgeAwards).toHaveBeenCalledTimes(2);
    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(
      harness.commandRunner.mock.calls.filter(
        ([, , , failureCode]) =>
          failureCode === "DATABASE_ATTESTATION_QUERY_FAILED"
      )
    ).toHaveLength(4);
    expect(result).toMatchObject({
      code: "BADGE_BACKFILL_COMPLETE",
      mode: "apply",
      firstPass: {
        awardsCreated: 1,
        errorCount: 0,
        playersEvaluated: 1,
      },
      secondPass: {
        awardsCreated: 0,
        errorCount: 0,
        playersEvaluated: 1,
      },
      postconditions: {
        databaseAttestationUnchangedAfterFirstPass: true,
        evaluationModeBackfill: true,
        firstPassNewAwards: 1,
        matchingNotifications: 0,
        matchingReveals: 0,
        secondPassNewAwards: 0,
        secondPassZero: true,
        validatedBackfillCohortAwards: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain(PLAYER_ID);
  });

  it("stops before the second pass when the attested Production snapshot changes after pass one", async () => {
    const harness = createHarness({
      apply: true,
      databaseAttestationOverrides: [
        {},
        {},
        {
          open_player_count: 2,
          open_player_sha256: "d".repeat(64),
          synthetic_open_player_count: 1,
        },
      ],
      target: "production",
    });
    harness.backfillInitialBadgeAwards.mockImplementationOnce(async () => {
      harness.state.awards.push(awardRow(FIRST_AWARD_ID, "backfill"));
      return backfillResult({ awardsCreated: 1 });
    });

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({
      code: "DATABASE_ATTESTATION_CHANGED_AFTER_FIRST_PASS",
    });
    expect(harness.backfillInitialBadgeAwards).toHaveBeenCalledOnce();
    expect(harness.state.awards).toEqual([
      awardRow(FIRST_AWARD_ID, "backfill"),
    ]);
    expect(harness.server.close).toHaveBeenCalledOnce();
  });

  it("stops before the second pass when the Production candidate population changes after pass one", async () => {
    const harness = createHarness({
      apply: true,
      databaseAttestationOverrides: [
        {},
        {},
        {
          candidate_player_count: 0,
          candidate_player_sha256: hashPlayerIds([]),
        },
      ],
      target: "production",
    });
    harness.backfillInitialBadgeAwards.mockImplementationOnce(async () => {
      harness.state.awards.push(awardRow(FIRST_AWARD_ID, "backfill"));
      return backfillResult({ awardsCreated: 1 });
    });

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({
      code: "PRODUCTION_CANDIDATE_ATTESTATION_MISMATCH",
    });
    expect(harness.backfillInitialBadgeAwards).toHaveBeenCalledOnce();
    expect(harness.state.awards).toEqual([
      awardRow(FIRST_AWARD_ID, "backfill"),
    ]);
    expect(harness.server.close).toHaveBeenCalledOnce();
  });

  it("retains but fails closed on an observed partial award diff", async () => {
    const harness = createHarness({ apply: true });
    harness.backfillInitialBadgeAwards.mockImplementationOnce(
      async (input: BackfillInput) => {
        expect(input.playerIds).toEqual([PLAYER_ID]);
        harness.state.awards.push(awardRow(FIRST_AWARD_ID, "backfill"));
        return backfillResult({
          awardsCreated: 1,
          errors: [{ playerId: PLAYER_ID, code: "MATCH_SUMMARY_LOAD_FAILED" }],
        });
      }
    );

    let caught: unknown;
    try {
      await runInitialAwardsBackfill(harness.options, harness.deps);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "BACKFILL_PASS_PARTIAL_FAILURE",
      details: {
        awardsCreated: 1,
        completedBatches: 1,
        errorCount: 1,
        errorsByCode: { MATCH_SUMMARY_LOAD_FAILED: 1 },
        pass: "first",
        retainedNewAwards: 1,
      },
    });
    expect(harness.state.awards).toHaveLength(1);
    expect(harness.backfillInitialBadgeAwards).toHaveBeenCalledOnce();
    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(sanitizeFailure(caught, harness.options))).not.toContain(
      PLAYER_ID
    );
  });

  it("rejects a first-pass award count that differs from the observed database delta", async () => {
    const harness = createHarness({ apply: true });
    harness.backfillInitialBadgeAwards.mockImplementationOnce(async () =>
      backfillResult({ awardsCreated: 1 })
    );

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({ code: "BACKFILL_PASS_FAILED" });
    expect(harness.backfillInitialBadgeAwards).toHaveBeenCalledOnce();
    expect(harness.state.awards).toEqual([]);
    expect(harness.server.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["notification", 1, 0],
    ["reveal", 0, 1],
  ])(
    "fails when a historical %s side effect exists for a new award",
    async (_, notificationCount, revealCount) => {
      const harness = createHarness({
        apply: true,
        notificationCount,
        revealCount,
      });
      harness.backfillInitialBadgeAwards.mockImplementationOnce(async () => {
        harness.state.awards.push(awardRow(FIRST_AWARD_ID, "backfill"));
        return backfillResult({ awardsCreated: 1 });
      });

      await expect(
        runInitialAwardsBackfill(harness.options, harness.deps)
      ).rejects.toMatchObject({
        code: "BACKFILL_PRESENTATION_SIDE_EFFECT_DETECTED",
        details: {
          matchingNotifications: notificationCount,
          matchingReveals: revealCount,
          retainedNewAwards: 1,
        },
      });
      expect(harness.backfillInitialBadgeAwards).toHaveBeenCalledOnce();
      expect(harness.server.close).toHaveBeenCalledOnce();
    }
  );

  it("rejects a second pass that creates any additional award", async () => {
    const harness = createHarness({ apply: true });
    harness.backfillInitialBadgeAwards
      .mockImplementationOnce(async () => {
        harness.state.awards.push(awardRow(FIRST_AWARD_ID, "backfill"));
        return backfillResult({ awardsCreated: 1 });
      })
      .mockImplementationOnce(async () => {
        harness.state.awards.push(
          awardRow(SECOND_AWARD_ID, "backfill", "first-deployment")
        );
        return backfillResult({
          awardsCreated: 1,
          badgeSlug: "first-deployment",
        });
      });

    await expect(
      runInitialAwardsBackfill(harness.options, harness.deps)
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_PASS_FAILED" });
    expect(harness.backfillInitialBadgeAwards).toHaveBeenCalledTimes(2);
    expect(harness.state.awards).toHaveLength(2);
    expect(harness.server.close).toHaveBeenCalledOnce();
  });
});

type BackfillInput = {
  playerIds: string[];
  supabase: unknown;
};

type AwardRow = ReturnType<typeof awardRow>;

function createHarness({
  apply,
  commandOutputs = {},
  databaseAttestationOverrides = [],
  notificationCount = 0,
  revealCount = 0,
  target = "staging",
}: {
  apply: boolean;
  commandOutputs?: Record<string, string>;
  databaseAttestationOverrides?: Array<Record<string, unknown>>;
  notificationCount?: number;
  revealCount?: number;
  target?: "staging" | "production";
}) {
  const directory = mkdtempSync(join(tmpdir(), "badge-backfill-contract-"));
  temporaryDirectories.push(directory);
  const allowlistPath = join(directory, "staging.json");
  const allowlistDocument = JSON.stringify(
    {
      schemaVersion: 1,
      target,
      projectRef: target === "production" ? PRODUCTION_REF : STAGING_REF,
      playerIds: [PLAYER_ID],
    },
    null,
    2
  );
  writeFileSync(allowlistPath, allowlistDocument, "utf8");
  const fileSha256 = createHash("sha256")
    .update(Buffer.from(allowlistDocument, "utf8"))
    .digest("hex");
  const playerIdsSha256 = hashPlayerIds([PLAYER_ID]);
  const state: { awards: AwardRow[] } = { awards: [] };
  const client = createReadClient({
    notificationCount,
    playerIds: [PLAYER_ID],
    revealCount,
    state,
  });
  const clientFactory = vi.fn(() => client);
  const server = { close: vi.fn(async () => undefined) };
  const backfillInitialBadgeAwards = vi.fn();
  const authorityLoader = vi.fn(async () => ({
    backfillInitialBadgeAwards,
    server,
  }));
  const options = {
    allowlistFile: allowlistPath,
    allowlistSha256: fileSha256,
    apply,
    baseUrl:
      target === "production"
        ? BACKFILL_TARGETS.production.baseUrl
        : BASE_URL,
    confirmProjectRef:
      target === "production" ? PRODUCTION_REF : STAGING_REF,
    expectedApplicationHead: EXPECTED_APPLICATION_HEAD,
    expectedToolingHead: EXPECTED_TOOLING_HEAD,
    help: false,
    target,
  };
  const commandRunner = createCommandRunner(playerIdsSha256, target, {
    commandOutputs,
    databaseAttestationOverrides,
  });

  return {
    allowlistPath,
    authorityLoader,
    backfillInitialBadgeAwards,
    client,
    commandRunner,
    deps: {
      authorityLoader:
        authorityLoader as unknown as typeof import("../../scripts/badges/initial-awards-backfill.mjs").loadBadgeAuthority,
      clientFactory:
        clientFactory as unknown as typeof import("@supabase/supabase-js").createClient,
      commandRunner:
        commandRunner as unknown as typeof import("../../scripts/badges/initial-awards-backfill.mjs").runCheckedCommand,
      environment: runtimeEnvironment(
        target === "production" ? PRODUCTION_REF : STAGING_REF
      ),
      repositoryRoot: process.cwd(),
    },
    fileSha256,
    options,
    server,
    state,
  };
}

function createCommandRunner(
  playerIdsSha256: string,
  target: "staging" | "production",
  {
    commandOutputs,
    databaseAttestationOverrides,
  }: {
    commandOutputs: Record<string, string>;
    databaseAttestationOverrides: Array<Record<string, unknown>>;
  }
) {
  const project = BACKFILL_TARGETS[target];
  let databaseAttestationCall = 0;
  return vi.fn(
    (
      _command: string,
      _arguments: string[],
      _cwd: string,
      failureCode: string
    ) => {
      if (Object.hasOwn(commandOutputs, failureCode)) {
        return commandOutputs[failureCode];
      }

      switch (failureCode) {
        case "GIT_HEAD_LOAD_FAILED":
          return `${EXPECTED_TOOLING_HEAD}\n`;
        case "GIT_STATUS_LOAD_FAILED":
          return "";
        case "GIT_TOOLING_BASE_LOAD_FAILED":
          return `${APPROVED_TOOLING_BASE_HEAD}\n`;
        case "GIT_TOOLING_DIFF_LOAD_FAILED":
          return `${AUTHORIZED_TOOLING_PATHS.join("\n")}\n`;
        case "GIT_RUNTIME_MODULE_DIFF_LOAD_FAILED":
          return "";
        case "SUPABASE_PROJECT_LIST_FAILED":
          return JSON.stringify([
            {
              id: project.ref,
              name: project.name,
              status: "ACTIVE_HEALTHY",
            },
          ]);
        case "VERCEL_DEPLOYMENT_INSPECTION_FAILED":
          return JSON.stringify({
            id: "dpl_BadgeBackfillTest",
            readyState: "READY",
            target: target === "production" ? "production" : null,
            url:
              target === "production"
                ? "www.ironcladtournaments.com"
                : "ironclad-backfill-preview.vercel.app",
          });
        case "VERCEL_DEPLOYMENT_METADATA_FAILED":
          return JSON.stringify({
            gitSource: { sha: EXPECTED_APPLICATION_HEAD },
            id: "dpl_BadgeBackfillTest",
            readyState: "READY",
            target: target === "production" ? "production" : null,
          });
        case "DATABASE_ATTESTATION_QUERY_FAILED":
          const override =
            databaseAttestationOverrides[
              Math.min(
                databaseAttestationCall,
                databaseAttestationOverrides.length - 1
              )
            ] ?? {};
          databaseAttestationCall += 1;
          return JSON.stringify({
            rows: [
              {
                allowlist_closed_or_missing_count: 0,
                allowlist_player_count: 1,
                allowlist_player_sha256: playerIdsSha256,
                allowlist_synthetic_overlap_count: 0,
                allowlist_unavailable_identity_count: 0,
                candidate_player_count: 1,
                candidate_player_sha256: playerIdsSha256,
                legitimate_open_allowlist_player_count: 1,
                legitimate_open_allowlist_player_sha256: playerIdsSha256,
                open_player_count: 1,
                open_player_sha256: playerIdsSha256,
                synthetic_open_player_count: 0,
                unavailable_identity_open_player_count: 0,
                ...override,
              },
            ],
          });
        default:
          throw new Error(`Unexpected command failure code: ${failureCode}`);
      }
    }
  );
}

function createReadClient({
  notificationCount,
  playerIds,
  revealCount,
  state,
}: {
  notificationCount: number;
  playerIds: string[];
  revealCount: number;
  state: { awards: AwardRow[] };
}) {
  const from = vi.fn((table: string) => {
    if (table === "players") {
      const query = {
        in: vi.fn(),
        is: vi.fn(async () => ({
          data: playerIds.map((id) => ({
            account_closed_at: null,
            clerk_user_id: "user_BackfillTest",
            id,
          })),
          error: null,
        })),
        select: vi.fn(),
      };
      query.select.mockReturnValue(query);
      query.in.mockReturnValue(query);
      return query;
    }

    if (table === "player_badge_awards") {
      const query = {
        in: vi.fn(),
        order: vi.fn(),
        range: vi.fn(async () => ({
          data: state.awards.map((award) => structuredClone(award)),
          error: null,
        })),
        select: vi.fn(),
      };
      query.select.mockReturnValue(query);
      query.in.mockReturnValue(query);
      query.order.mockReturnValue(query);
      return query;
    }

    if (table === "notifications") {
      const query = {
        eq: vi.fn(),
        in: vi.fn(async () => ({ count: notificationCount, error: null })),
        select: vi.fn(),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    }

    if (table === "player_badge_reveals") {
      const query = {
        in: vi.fn(async () => ({ count: revealCount, error: null })),
        select: vi.fn(),
      };
      query.select.mockReturnValue(query);
      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from };
}

function backfillResult({
  awardsCreated,
  badgeSlug = "ironclad-recruit",
  errors = [],
}: {
  awardsCreated: number;
  badgeSlug?: string;
  errors?: Array<{ playerId: string; code: string }>;
}) {
  return {
    awardsCreated,
    badgeCounts: { [badgeSlug]: awardsCreated },
    errors,
    playersEvaluated: 1,
  };
}

function awardRow(
  id: string,
  evaluationMode: string,
  badgeSlug = "ironclad-recruit"
) {
  return {
    badge_slug: badgeSlug,
    id,
    player_id: PLAYER_ID,
    source_metadata: { evaluationMode },
  };
}

function runtimeEnvironment(projectRef: string) {
  return {
    NODE_ENV: "test" as const,
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

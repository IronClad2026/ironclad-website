import { mkdtempSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

type Badge20ResumeTestState = {
  playerId: string;
  championRegistrationId: string;
  tournamentId: string;
  generatedBracketId: string;
  registrationIds: string[];
  championQuarterfinalId: string;
  untouchedQuarterfinalId: string;
  automaticByeMatchId: string;
  finalMatchId: string;
  expectedDeadline: string;
};

describe("badge staging E2E harness", () => {
  it("keeps the scenario registry complete and executable for all 30 badges", async () => {
    const {
      BADGE_SCENARIOS,
      COVERAGE_CLASSIFICATIONS,
      SCENARIO_HANDLER_REGISTRY,
      declaredScenarioIds,
    } = await import("../../scripts/badges/staging-helpers/assertions.mjs");

    expect(BADGE_SCENARIOS).toHaveLength(30);
    expect(BADGE_SCENARIOS.map((scenario) => scenario.number)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1)
    );
    expect(new Set(BADGE_SCENARIOS.map((scenario) => scenario.slug)).size).toBe(30);
    expect(
      BADGE_SCENARIOS.every(
        (scenario) =>
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario.positive) &&
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario.negative) &&
          scenario.positive !== scenario.negative &&
          scenario.evaluator &&
          scenario.authority &&
          COVERAGE_CLASSIFICATIONS.includes(scenario.classification) &&
          Array.isArray(scenario.positiveCases) &&
          scenario.positiveCases.length >= 1 &&
          Array.isArray(scenario.negativeCases) &&
          scenario.negativeCases.length >= 1
      )
    ).toBe(true);

    const declaredIds = declaredScenarioIds();
    const handlerRegistry = SCENARIO_HANDLER_REGISTRY as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    expect(declaredIds.length).toBeGreaterThan(30);
    for (const scenarioId of declaredIds) {
      const handler = handlerRegistry[scenarioId];
      expect(handler, scenarioId).toEqual(expect.any(Function));
      const handlerSource = handler.toString();
      expect(handlerSource.length, scenarioId).toBeGreaterThan(80);
      expect(handlerSource, scenarioId).not.toMatch(/hardcoded\s+PASS/i);
      expect(handlerSource, scenarioId).not.toMatch(/\breturn\s+true\b/);
    }

    expect(
      BADGE_SCENARIOS.filter((scenario) => scenario.classification === "SIMULATED")
    ).toEqual([]);
    expect(
      BADGE_SCENARIOS.filter((scenario) => scenario.classification === "BROKEN")
    ).toEqual([]);
    expect(
      BADGE_SCENARIOS.filter((scenario) => scenario.classification === "PARTIAL").map(
        (scenario) => scenario.slug
      )
    ).toEqual([]);
    expect(
      BADGE_SCENARIOS.find((scenario) => scenario.slug === "flawless-campaign")
        ?.classification
    ).toBe("REAL E2E");
    expect(
      BADGE_SCENARIOS.find((scenario) => scenario.slug === "flawless-campaign")
        ?.limitations
    ).toEqual([]);
  });

  it("registers every Badge 20 handler, including delayed bye phases and Void", async () => {
    const {
      BADGE20_HANDLER_CONTRACTS,
      BADGE20_REQUIRED_SCENARIO_IDS,
      SCENARIO_HANDLER_REGISTRY,
      badge20RealE2EHandlersAvailable,
    } = await import("../../scripts/badges/staging-helpers/assertions.mjs");

    expect(BADGE20_REQUIRED_SCENARIO_IDS).toContain(
      "flawless-automatic-bye-phase-1"
    );
    expect(BADGE20_REQUIRED_SCENARIO_IDS).toContain(
      "flawless-automatic-bye-positive"
    );
    expect(BADGE20_REQUIRED_SCENARIO_IDS).toContain(
      "flawless-void-invalidated-evidence"
    );
    expect(BADGE20_REQUIRED_SCENARIO_IDS).toContain(
      "flawless-incomplete-championship-path"
    );
    expect(BADGE20_REQUIRED_SCENARIO_IDS).toContain(
      "flawless-reset-invalidated-evidence"
    );
    expect(badge20RealE2EHandlersAvailable()).toBe(true);

    const missingPhaseTwo = {
      ...SCENARIO_HANDLER_REGISTRY,
      "flawless-automatic-bye-positive": undefined,
    };
    const missingVoid = {
      ...SCENARIO_HANDLER_REGISTRY,
      "flawless-void-invalidated-evidence": undefined,
    };
    expect(
      badge20RealE2EHandlersAvailable(
        missingPhaseTwo as unknown as typeof SCENARIO_HANDLER_REGISTRY
      )
    ).toBe(false);
    expect(
      badge20RealE2EHandlersAvailable(
        missingVoid as unknown as typeof SCENARIO_HANDLER_REGISTRY
      )
    ).toBe(false);
    expect(
      badge20RealE2EHandlersAvailable(
        {
          ...SCENARIO_HANDLER_REGISTRY,
          "flawless-incomplete-championship-path": async () => undefined,
        } as unknown as typeof SCENARIO_HANDLER_REGISTRY
      )
    ).toBe(false);

    const wrongBadge = {
      ...BADGE20_HANDLER_CONTRACTS,
      "flawless-incomplete-championship-path": {
        ...BADGE20_HANDLER_CONTRACTS["flawless-incomplete-championship-path"],
        targetBadgeSlug: "first-campaign",
      },
    };
    const proxyAssertion = {
      ...BADGE20_HANDLER_CONTRACTS,
      "flawless-reset-invalidated-evidence": {
        ...BADGE20_HANDLER_CONTRACTS["flawless-reset-invalidated-evidence"],
        independentAwardAssertion: false,
      },
    };
    expect(
      badge20RealE2EHandlersAvailable(
        SCENARIO_HANDLER_REGISTRY,
        wrongBadge as unknown as typeof BADGE20_HANDLER_CONTRACTS
      )
    ).toBe(false);
    expect(
      badge20RealE2EHandlersAvailable(
        SCENARIO_HANDLER_REGISTRY,
        proxyAssertion as unknown as typeof BADGE20_HANDLER_CONTRACTS
      )
    ).toBe(false);
  });

  it("behaviorally proves the Badge 20 incomplete-path negative", async () => {
    const { runFlawlessIncompletePathScenario } = await import(
      "../../scripts/badges/staging-helpers/assertions.mjs"
    );
    const calls: string[] = [];
    const player = { id: "player-incomplete" };
    const match = fixtureMatch({
      id: "match-incomplete",
      playerId: player.id,
      registrationId: "registration-incomplete",
    });
    const runtime = {
      createFixturePlayer: vi.fn(async () => player),
      assertNoPreexistingAward: vi.fn(async () => calls.push("precondition")),
      playFirstMatchOnly: vi.fn(async () => ({
        division: { tournament: { id: "tournament-incomplete" } },
        match,
      })),
      loadTournament: vi.fn(async () => ({ status: "in_progress" })),
      rpcRows: vi.fn(async (_ctx, name: string) => {
        if (name === "get_tournament_championship_path_segments") {
          return [{
            source_match_id: match.id,
            outcome_kind: "played",
            authority_state: "active",
          }];
        }
        return [];
      }),
      recordCorrectionAssertion: vi.fn((_manifest, value) => {
        expect(value.pass).toBe(true);
        calls.push("authority");
      }),
      allowExpectedAwards: vi.fn(),
      evaluateProductionBadges: vi.fn(async (_ctx, input) => {
        expect(input).toMatchObject({
          kind: "player",
          playerId: player.id,
          scenario: "flawless-incomplete-championship-path",
        });
        calls.push("evaluator");
      }),
      assertBadgeAward: vi.fn(async (_ctx, _report, input) => {
        expect(input).toMatchObject({
          playerId: player.id,
          badgeSlug: "flawless-campaign",
          expected: false,
        });
        calls.push("award-read");
      }),
    };

    await runFlawlessIncompletePathScenario(
      { manifest: {} },
      {},
      { runtime }
    );

    expect(calls).toEqual([
      "precondition",
      "authority",
      "evaluator",
      "award-read",
    ]);
  });

  it("behaviorally proves the Badge 20 reset-invalidated negative", async () => {
    const { runFlawlessResetInvalidationScenario } = await import(
      "../../scripts/badges/staging-helpers/assertions.mjs"
    );
    const calls: string[] = [];
    let reset = false;
    const player = { id: "player-reset" };
    const registrationId = "registration-reset";
    const match = fixtureMatch({
      id: "match-reset",
      playerId: player.id,
      registrationId,
    });
    const beforeParticipant = {
      registration_id: registrationId,
      outcome_kind: "played",
      source_type: "match_finalization",
      revision: 1,
    };
    const beforeGame = {
      game_number: 1,
      authority_state: "active",
      source_type: "match_finalization",
      revision: 1,
    };
    const runtime = {
      createFixturePlayer: vi.fn(async () => player),
      assertNoPreexistingAward: vi.fn(async () => calls.push("precondition")),
      playFirstMatchOnly: vi.fn(async () => ({
        division: { tournament: { id: "tournament-reset" } },
        match,
      })),
      loadMatchAuthority: vi.fn(async () => reset
        ? {
            participants: [
              beforeParticipant,
              {
                registration_id: registrationId,
                outcome_kind: "unknown",
                source_type: "match_reset",
                revision: 2,
              },
            ],
            games: [
              beforeGame,
              {
                game_number: 1,
                authority_state: "invalidated",
                source_type: "match_reset",
                revision: 2,
              },
            ],
          }
        : { participants: [beforeParticipant], games: [beforeGame] }),
      resetMatch: vi.fn(async () => {
        calls.push("reset");
        reset = true;
      }),
      rpcRows: vi.fn(async (_ctx, name: string) => {
        if (name === "get_tournament_championship_path_summary") return [];
        return [{
          source_match_id: match.id,
          outcome_kind: reset ? "unknown" : "played",
          authority_state: "active",
          revision: reset ? 2 : 1,
        }];
      }),
      recordCorrectionAssertion: vi.fn((_manifest, value) => {
        expect(value).toMatchObject({
          relevantPathExisted: true,
          invalidatedGames: true,
          participantInvalidated: true,
          pathSuperseded: true,
          pass: true,
        });
        calls.push("authority");
      }),
      allowExpectedAwards: vi.fn(),
      evaluateProductionBadges: vi.fn(async () => calls.push("evaluator")),
      assertBadgeAward: vi.fn(async (_ctx, _report, input) => {
        expect(input).toMatchObject({
          badgeSlug: "flawless-campaign",
          expected: false,
        });
        calls.push("award-read");
      }),
    };

    await runFlawlessResetInvalidationScenario(
      { manifest: {} },
      {},
      { runtime }
    );

    expect(calls).toEqual([
      "precondition",
      "reset",
      "authority",
      "evaluator",
      "award-read",
    ]);
  });

  it("propagates Badge 20 evaluator failures", async () => {
    const { runFlawlessIncompletePathScenario } = await import(
      "../../scripts/badges/staging-helpers/assertions.mjs"
    );
    const player = { id: "player-evaluator-failure" };
    const match = fixtureMatch({
      id: "match-evaluator-failure",
      playerId: player.id,
      registrationId: "registration-evaluator-failure",
    });
    const awardAssertion = vi.fn();

    await expect(
      runFlawlessIncompletePathScenario(
        { manifest: {} },
        {},
        {
          runtime: {
            createFixturePlayer: async () => player,
            assertNoPreexistingAward: async () => undefined,
            playFirstMatchOnly: async () => ({
              division: { tournament: { id: "tournament-evaluator-failure" } },
              match,
            }),
            loadTournament: async () => ({ status: "in_progress" }),
            rpcRows: async (_ctx: unknown, name: string) =>
              name === "get_tournament_championship_path_segments"
                ? [{
                    source_match_id: match.id,
                    outcome_kind: "played",
                    authority_state: "active",
                  }]
                : [],
            recordCorrectionAssertion: () => undefined,
            allowExpectedAwards: () => undefined,
            evaluateProductionBadges: async () => {
              throw new Error("production evaluator unavailable");
            },
            assertBadgeAward: awardAssertion,
          },
        }
      )
    ).rejects.toThrow(/production evaluator unavailable/i);
    expect(awardAssertion).not.toHaveBeenCalled();
  });

  it("behaviorally orchestrates Badge 20 automatic-bye phase 1", async () => {
    const {
      FLAWLESS_AUTOMATIC_BYE_SCENARIO,
      runFlawlessAutomaticByePhaseOne,
    } = await import(
      "../../scripts/badges/staging-helpers/flawless-campaign.mjs"
    );
    const championId = "player-phase-one";
    const championRegistrationId = "registration-phase-one";
    const deadline = "2026-09-05T12:00:00.000Z";
    const matches = automaticByeTopology();
    const matchById = new Map(matches.map((match) => [match.id, match]));
    const recordedStates: Array<Record<string, unknown>> = [];
    const completed: string[] = [];
    const ctx = gatedHarnessContext();

    const state = await runFlawlessAutomaticByePhaseOne(ctx, {
      runtime: {
        createFixturePlayer: async () => ({ id: championId }),
        assertNoFlawlessAward: async () => undefined,
        createTournamentDivision: async () => ({
          tournament: { id: "tournament-phase-one" },
          bracket: { id: "bracket-phase-one" },
          generated: { id: "generated-phase-one" },
          participants: [
            { registration: { id: championRegistrationId } },
            ...Array.from({ length: 7 }, (_, index) => ({
              registration: { id: `registration-fill-${index}` },
            })),
          ],
        }),
        loadGeneratedMatches: async () => matches,
        loadMatch: async (_ctx: unknown, id: string) => {
          const match = matchById.get(id);
          if (!match) throw new Error(`unknown match ${id}`);
          if (id === "qf-1") {
            return {
              ...match,
              player_one_registration_id: championRegistrationId,
            };
          }
          if (id === "qf-2") {
            return {
              ...match,
              status: "in_progress",
              outcome_type: null,
              deadline_at: deadline,
            };
          }
          if (id === "sf-1") {
            return {
              ...match,
              status: "scheduled",
              player_one_registration_id: championRegistrationId,
              player_two_registration_id: null,
            };
          }
          return match;
        },
        completeCleanMatch: async (_ctx: unknown, match: { id: string }) => {
          completed.push(match.id);
        },
        recordScenario: (_manifest: unknown, key: string, value: Record<string, unknown>) => {
          expect(key).toBe(FLAWLESS_AUTOMATIC_BYE_SCENARIO);
          recordedStates.push(value);
        },
      },
    });

    expect(recordedStates.map((entry) => entry.phase)).toEqual([
      "CREATING_TOURNAMENT",
      "PREPARING",
      "WAITING_FOR_REAL_DEADLINE",
    ]);
    expect(completed).toEqual(["qf-1", "qf-3", "qf-4", "sf-2"]);
    expect(state).toMatchObject({
      phase: "WAITING_FOR_REAL_DEADLINE",
      expectedDeadline: deadline,
      untouchedQuarterfinalId: "qf-2",
      automaticByeMatchId: "sf-1",
    });
  });

  it("behaviorally orchestrates Badge 20 automatic-bye phase 2", async () => {
    const {
      createAutomaticByeResumeState,
      runFlawlessAutomaticByePhaseTwo,
    } = await import(
      "../../scripts/badges/staging-helpers/flawless-campaign.mjs"
    );
    const { STAGING_PROJECT } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const manifest = badge20ResumeManifest(
      createAutomaticByeResumeState,
      STAGING_PROJECT.ref
    );
    const state = manifest.scenarios[
      "flawless-automatic-bye-positive"
    ] as Badge20ResumeTestState;
    const calls: string[] = [];
    let deadlineProcessed = false;
    let pathLoadCount = 0;
    const ctx = {
      ...gatedHarnessContext(),
      runMarker: manifest.runMarker,
      manifest,
      supabase: {
        rpc: vi.fn(async (name: string) => {
          expect(name).toBe("process_matchup_deadlines");
          calls.push("deadline");
          deadlineProcessed = true;
          return { data: { processed: 1 }, error: null };
        }),
      },
    };
    const runtime = {
      loadMatch: vi.fn(async (_ctx: unknown, id: string) => {
        if (id === state.untouchedQuarterfinalId) {
          return {
            id,
            generated_bracket_id: state.generatedBracketId,
            deadline_at: state.expectedDeadline,
            status: deadlineProcessed ? "completed" : "in_progress",
            outcome_type: deadlineProcessed ? "deadline_double_forfeit" : null,
            winner_registration_id: null,
          };
        }
        if (id === state.automaticByeMatchId) {
          return {
            id,
            generated_bracket_id: state.generatedBracketId,
            status: "completed",
            outcome_type: "automatic_bye",
            player_one_registration_id: state.championRegistrationId,
            player_two_registration_id: null,
            winner_registration_id: state.championRegistrationId,
          };
        }
        return {
          id,
          generated_bracket_id: state.generatedBracketId,
          player_one_registration_id: state.championRegistrationId,
          player_two_registration_id: state.registrationIds[1],
        };
      }),
      loadMatchAuthority: vi.fn(async () => ({
        participants: [{
          registration_id: state.championRegistrationId,
          outcome_kind: "automatic_bye",
          revision: 1,
        }],
        games: [],
      })),
      loadChampionshipPath: vi.fn(async () => {
        pathLoadCount += 1;
        const segments = [
          {
            source_match_id: state.championQuarterfinalId,
            outcome_kind: "played",
            authority_state: "active",
          },
          {
            source_match_id: state.automaticByeMatchId,
            outcome_kind: "automatic_bye",
            authority_state: "active",
          },
          {
            source_match_id: state.finalMatchId,
            outcome_kind: "played",
            authority_state: "active",
          },
        ];
        return pathLoadCount === 1
          ? { summary: null, segments: segments.slice(0, 2) }
          : {
              summary: {
                completeness_state: "complete",
                observed_path_segment_count: 3,
                expected_path_segment_count: 3,
              },
              segments,
            };
      }),
      completeCleanMatch: vi.fn(async () => calls.push("final")),
      recalculateTournament: vi.fn(async () => calls.push("recalculate")),
      rpcRows: vi.fn(async () => [{
        tournament_id: state.tournamentId,
        automatic_bye_count: 1,
      }]),
      recordExpectedAward: vi.fn(),
      evaluateProductionBadges: vi.fn(async () => calls.push("evaluator")),
      flawlessAwardRows: vi.fn(async () => {
        calls.push("award-read");
        return [{
          id: "award-phase-two",
          awarded_at: "2026-09-05T12:01:00.000Z",
          source_type: "tournament",
          source_id: state.tournamentId,
        }];
      }),
      recordActualAward: vi.fn(),
      recordScenario: vi.fn(),
    };

    const completed = await runFlawlessAutomaticByePhaseTwo(ctx, {
      productionNow: "2026-09-05T12:00:00.001Z",
      runtime,
    });

    expect(calls).toEqual([
      "deadline",
      "final",
      "recalculate",
      "evaluator",
      "award-read",
    ]);
    expect(completed).toMatchObject({
      phase: "COMPLETED",
      automaticByeCount: 1,
      gameAuthorityCount: 0,
      badgeAwardId: "award-phase-two",
    });
  });

  it("propagates Badge 20 deadline-processing failures", async () => {
    const {
      createAutomaticByeResumeState,
      runFlawlessAutomaticByePhaseTwo,
    } = await import(
      "../../scripts/badges/staging-helpers/flawless-campaign.mjs"
    );
    const { STAGING_PROJECT } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const manifest = badge20ResumeManifest(
      createAutomaticByeResumeState,
      STAGING_PROJECT.ref
    );
    const state = manifest.scenarios[
      "flawless-automatic-bye-positive"
    ] as Badge20ResumeTestState;
    const ctx = {
      ...gatedHarnessContext(),
      runMarker: manifest.runMarker,
      manifest,
      supabase: {
        rpc: vi.fn(async () => ({
          data: null,
          error: { message: "deadline worker unavailable" },
        })),
      },
    };

    await expect(
      runFlawlessAutomaticByePhaseTwo(ctx, {
        productionNow: "2026-09-05T12:00:00.001Z",
        runtime: {
          loadMatch: async () => ({
            generated_bracket_id: state.generatedBracketId,
            deadline_at: state.expectedDeadline,
            status: "in_progress",
            outcome_type: null,
          }),
        },
      })
    ).rejects.toThrow(/deadline worker unavailable/i);
  });

  it("behaviorally orchestrates Badge 20 completed-path Void invalidation", async () => {
    const { runFlawlessVoidInvalidationScenario } = await import(
      "../../scripts/badges/staging-helpers/assertions.mjs"
    );
    const calls: string[] = [];
    let voided = false;
    const completed = {
      tournament: { id: "tournament-void" },
      championRegistrationId: "registration-void",
      completedMatches: ["match-void"],
    };
    const beforeSummary = {
      completeness_state: "complete",
      revision: 1,
    };
    const beforeSegment = {
      path_index: 1,
      outcome_kind: "played",
      source_type: "match_authority",
      revision: 1,
    };
    const runtime = {
      createFixturePlayer: vi.fn(async () => ({ id: "player-void" })),
      assertNoPreexistingAward: vi.fn(async () => calls.push("precondition")),
      createAndPlayTournament: vi.fn(async (_ctx, input) => {
        expect(input.evaluateBadges).toBe(false);
        calls.push("complete");
        return completed;
      }),
      assertFlawlessEvidence: vi.fn(async () => calls.push("complete-path")),
      firstRpcRow: vi.fn(async () => voided
        ? {
            completeness_state: "invalidated",
            source_type: "tournament_void",
            revision: 2,
          }
        : beforeSummary),
      rpcRows: vi.fn(async () => voided
        ? [{
            path_index: 1,
            outcome_kind: "voided",
            source_type: "tournament_void",
            revision: 2,
          }]
        : [beforeSegment]),
      loadQualifyingTournamentWins: vi.fn(async () =>
        voided ? [] : [{ id: "tournament-win" }]
      ),
      voidTournament: vi.fn(async () => {
        calls.push("void");
        voided = true;
        return { outcome: "voided" };
      }),
      recordCorrectionAssertion: vi.fn((_manifest, value) => {
        expect(value).toMatchObject({
          segmentsVoided: true,
          summaryInvalidated: true,
          tournamentWinRemoved: true,
          pass: true,
        });
        calls.push("authority");
      }),
      allowExpectedAwards: vi.fn(),
      evaluateProductionBadges: vi.fn(async () => calls.push("evaluator")),
      assertBadgeAward: vi.fn(async (_ctx, _report, input) => {
        expect(input).toMatchObject({
          badgeSlug: "flawless-campaign",
          expected: false,
        });
        calls.push("award-read");
      }),
    };

    await runFlawlessVoidInvalidationScenario(
      { manifest: {} },
      {},
      { runtime }
    );

    expect(calls).toEqual([
      "precondition",
      "complete",
      "complete-path",
      "void",
      "authority",
      "evaluator",
      "award-read",
    ]);
  });

  it("records an integrity-bound Badge 20 automatic-bye resume state", async () => {
    const { STAGING_PROJECT } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const { createAutomaticByeResumeState } = await import(
      "../../scripts/badges/staging-helpers/flawless-campaign.mjs"
    );
    const { recordScenario } = await import(
      "../../scripts/badges/staging-helpers/manifest.mjs"
    );
    const ids = badge20ResumeIds();
    const state = createAutomaticByeResumeState({
      runMarker: "badge-e2e-resume-test",
      projectRef: STAGING_PROJECT.ref,
      ...ids,
      expectedDeadline: "2026-09-05T12:00:00.000Z",
      phase: "WAITING_FOR_REAL_DEADLINE",
    });
    const manifest: { scenarios: Record<string, unknown> } = { scenarios: {} };
    recordScenario(manifest, "flawless-automatic-bye-positive", state);

    expect(manifest.scenarios["flawless-automatic-bye-positive"]).toMatchObject({
      runMarker: "badge-e2e-resume-test",
      projectRef: STAGING_PROJECT.ref,
      tournamentId: ids.tournamentId,
      divisionId: ids.divisionId,
      tournamentBracketId: ids.tournamentBracketId,
      generatedBracketId: ids.generatedBracketId,
      registrationIds: ids.registrationIds,
      championQuarterfinalId: ids.championQuarterfinalId,
      untouchedQuarterfinalId: ids.untouchedQuarterfinalId,
      automaticByeMatchId: ids.automaticByeMatchId,
      oppositeQuarterfinalIds: ids.oppositeQuarterfinalIds,
      oppositeSemifinalId: ids.oppositeSemifinalId,
      finalMatchId: ids.finalMatchId,
      expectedDeadline: "2026-09-05T12:00:00.000Z",
      phase: "WAITING_FOR_REAL_DEADLINE",
    });
    expect(state.resumeIntegritySha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects automatic-bye phase 2 before the real deadline", async () => {
    const {
      assertAutomaticByeResumeManifest,
      createAutomaticByeResumeState,
    } = await import(
      "../../scripts/badges/staging-helpers/flawless-campaign.mjs"
    );
    const { STAGING_PROJECT } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const manifest = badge20ResumeManifest(
      createAutomaticByeResumeState,
      STAGING_PROJECT.ref
    );

    expect(() =>
      assertAutomaticByeResumeManifest({
        manifest,
        expectedProjectRef: STAGING_PROJECT.ref,
        expectedRunMarker: manifest.runMarker,
        now: new Date("2026-09-05T11:59:59.999Z"),
      })
    ).toThrow(/real production deadline/i);
  });

  it("requires the same staging project, run marker, and intact resume manifest", async () => {
    const {
      assertAutomaticByeResumeManifest,
      createAutomaticByeResumeState,
    } = await import(
      "../../scripts/badges/staging-helpers/flawless-campaign.mjs"
    );
    const { STAGING_PROJECT } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const manifest = badge20ResumeManifest(
      createAutomaticByeResumeState,
      STAGING_PROJECT.ref
    );
    const afterDeadline = new Date("2026-09-05T12:00:00.001Z");

    expect(() =>
      assertAutomaticByeResumeManifest({
        manifest,
        expectedProjectRef: "abcdefghijklmnopqrst",
        expectedRunMarker: manifest.runMarker,
        now: afterDeadline,
      })
    ).toThrow(/staging project/i);
    expect(() =>
      assertAutomaticByeResumeManifest({
        manifest,
        expectedProjectRef: STAGING_PROJECT.ref,
        expectedRunMarker: "badge-e2e-another-run",
        now: afterDeadline,
      })
    ).toThrow(/run marker/i);

    const altered = structuredClone(manifest);
    altered.scenarios["flawless-automatic-bye-positive"].finalMatchId =
      "00000000-0000-4000-8000-000000000099";
    expect(() =>
      assertAutomaticByeResumeManifest({
        manifest: altered,
        expectedProjectRef: STAGING_PROJECT.ref,
        expectedRunMarker: altered.runMarker,
        now: afterDeadline,
      })
    ).toThrow(/integrity/i);
  });

  it("exposes explicit Badge 20 phase modes without a timestamp mutation path", async () => {
    const { parseArguments, STAGING_PROJECT } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const phaseOne = parseArguments([
      "--confirm-project-ref",
      STAGING_PROJECT.ref,
      "--badge20-bye-phase-1",
    ]);
    const phaseTwo = parseArguments([
      "--confirm-project-ref",
      STAGING_PROJECT.ref,
      "--badge20-bye-phase-2",
      "--manifest",
      "artifacts/badge-e2e/badge-e2e-test.json",
      "--run-marker",
      "badge-e2e-test",
    ]);
    expect(phaseOne.badge20ByePhase).toBe(1);
    expect(phaseTwo.badge20ByePhase).toBe(2);

    const source = await readFile(
      resolve("scripts/badges/staging-helpers/flawless-campaign.mjs"),
      "utf8"
    );
    expect(source).toContain('"process_matchup_deadlines"');
    expect(source).not.toMatch(
      /\.from\(\s*["']tournament_matches["']\s*\)[\s\S]{0,400}\.update\s*\(/
    );
    expect(source).not.toMatch(/(?:deadline_at|activated_at)\s*:/);
  });

  it("uses the exact staging read-only Management API without linked DB resolution", async () => {
    const {
      buildPreflightSql,
      buildReadOnlyPreflightEndpoint,
      runReadOnlyManagementQuery,
    } = await import("../../scripts/badges/staging-helpers/preflight.mjs");
    const { PRODUCTION_PROJECT, STAGING_PROJECT } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const accessToken = "sbp_fake_management_token_for_test";
    const sql = buildPreflightSql();
    const endpoint = buildReadOnlyPreflightEndpoint();
    const fetchImplementation = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(
          JSON.stringify([
            { badge_e2e_preflight: { target_ref: STAGING_PROJECT.ref } },
          ]),
          { status: 201 }
        );
      }
    );

    await expect(
      runReadOnlyManagementQuery(sql, accessToken, fetchImplementation)
    ).resolves.toContain(STAGING_PROJECT.ref);

    expect(endpoint).toBe(
      `https://api.supabase.com/v1/projects/${STAGING_PROJECT.ref}/database/query/read-only`
    );
    expect(endpoint).not.toContain(PRODUCTION_PROJECT.ref);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    const [requestedEndpoint, request] = fetchImplementation.mock.calls[0];
    const headers = request?.headers as Record<string, string>;
    const body = JSON.parse(String(request?.body)) as { query: string };
    expect(requestedEndpoint).toBe(endpoint);
    expect(request?.method).toBe("POST");
    expect(headers.Authorization === `Bearer ${accessToken}`).toBe(true);
    expect(body.query).toBe(sql);
    expect(String(requestedEndpoint)).not.toMatch(/--linked|--db-url|--local/);

    expect(sql.trimStart()).toMatch(/^with\b/i);
    expect(sql).not.toMatch(
      /^\s*(?:alter|create|delete|drop|grant|insert|revoke|truncate|update)\b/im
    );
  });

  it("maps the dedicated staging PAT into the Supabase CLI child", async () => {
    const { buildSupabaseCliChildEnvironment, runCommand } = await import(
      "../../scripts/badges/staging-helpers/preflight.mjs"
    );
    const { STAGING_PROJECT, buildTargetContext, parseArguments } = await import(
      "../../scripts/badges/staging-helpers/project-guard.mjs"
    );
    const harnessEnvironment = explicitStagingEnv(STAGING_PROJECT);
    harnessEnvironment.BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN =
      "sbp_fake_child_token_for_test";
    const targetContext = buildTargetContext(
      parseArguments(["--confirm-project-ref", STAGING_PROJECT.ref]),
      harnessEnvironment
    );
    const accessToken = targetContext.environment.supabaseAccessToken;
    const childEnvironment = buildSupabaseCliChildEnvironment(accessToken, {
      BADGE_E2E_SENTINEL: "preserved",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);

    expect(
      childEnvironment.SUPABASE_ACCESS_TOKEN ===
        harnessEnvironment.BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN
    ).toBe(true);
    expect(
      (childEnvironment as Record<string, string | undefined>)[
        "BADGE_E2E_SENTINEL"
      ]
    ).toBe("preserved");
    expect(() =>
      runCommand(
        process.execPath,
        [
          "-e",
          "process.exit(process.env.SUPABASE_ACCESS_TOKEN ? 0 : 1)",
        ],
        accessToken
      )
    ).not.toThrow();
  });

  it("reports both child streams and redacts secrets on CLI failure", async () => {
    const { runCommand } = await import(
      "../../scripts/badges/staging-helpers/preflight.mjs"
    );
    const accessToken = "sbp_fake_diagnostic_token_for_test";

    let failure = "";
    try {
      runCommand(
        process.execPath,
        [
          "-e",
          [
            "process.stdout.write('useful stdout: ' + process.env.SUPABASE_ACCESS_TOKEN);",
            "process.stderr.write('useful stderr: ' + process.env.SUPABASE_ACCESS_TOKEN);",
            "process.exit(7);",
          ].join(""),
        ],
        accessToken
      );
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    expect(failure).toContain("exit code: 7");
    expect(failure).toContain("useful stdout");
    expect(failure).toContain("useful stderr");
    expect(failure).toContain("[REDACTED]");
    expect(failure.includes(accessToken)).toBe(false);
  });

  it("sanitizes Management API failures without hiding useful diagnostics", async () => {
    const { runReadOnlyManagementQuery } = await import(
      "../../scripts/badges/staging-helpers/preflight.mjs"
    );
    const accessToken = "sbp_fake_api_failure_token_for_test";
    const fetchImplementation = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(`permission denied for Bearer ${accessToken}`, {
          status: 403,
        });
      }
    );

    let failure = "";
    try {
      await runReadOnlyManagementQuery(
        "select 1 as safe_read_only_probe",
        accessToken,
        fetchImplementation
      );
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    expect(failure).toContain("status 403");
    expect(failure).toContain("permission denied");
    expect(failure).toContain("[REDACTED]");
    expect(failure.includes(accessToken)).toBe(false);
  });

  it("allows Node to drain fetch handles after a preflight failure", async () => {
    const source = await readFile(
      resolve("scripts/badges/staging-e2e.mjs"),
      "utf8"
    );
    const failureHandler = source.slice(source.indexOf("} catch (error) {"));

    expect(failureHandler).toContain("process.exitCode = 1;");
    expect(failureHandler).not.toContain("process.exit(1);");
  });

  it("rejects the production project ref", async () => {
    const {
      PRODUCTION_PROJECT,
      buildTargetContext,
      parseArguments,
    } = await import("../../scripts/badges/staging-helpers/project-guard.mjs");

    expect(() =>
      buildTargetContext(
        parseArguments(["--confirm-project-ref", PRODUCTION_PROJECT.ref]),
        { NODE_ENV: "test" } as NodeJS.ProcessEnv
      )
    ).toThrow(/production is forbidden/i);
  });

  it("rejects unknown and malformed project refs", async () => {
    const {
      buildTargetContext,
      parseArguments,
    } = await import("../../scripts/badges/staging-helpers/project-guard.mjs");

    expect(() =>
      buildTargetContext(
        parseArguments(["--confirm-project-ref", "abcdefghijklmnopqrst"]),
        { NODE_ENV: "test" } as NodeJS.ProcessEnv
      )
    ).toThrow(/unknown supabase project ref/i);

    expect(() =>
      buildTargetContext(
        parseArguments(["--confirm-project-ref", "abc"]),
        { NODE_ENV: "test" } as NodeJS.ProcessEnv
      )
    ).toThrow(/malformed supabase project ref/i);
  });

  it("keeps generic Supabase variables from selecting the target", async () => {
    const {
      STAGING_PROJECT,
      PRODUCTION_PROJECT,
      buildTargetContext,
      openMutationGate,
      parseArguments,
    } = await import("../../scripts/badges/staging-helpers/project-guard.mjs");

    const context = buildTargetContext(
      parseArguments(["--confirm-project-ref", STAGING_PROJECT.ref]),
      {
        BADGE_E2E_STAGING_SUPABASE_URL: `https://${STAGING_PROJECT.ref}.supabase.co`,
        SUPABASE_URL: `https://${PRODUCTION_PROJECT.ref}.supabase.co`,
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv
    );

    expect(context.project.ref).toBe(STAGING_PROJECT.ref);
    expect(context.projectRefFromUrl).toBe(STAGING_PROJECT.ref);

    const genericOnly = buildTargetContext(
      parseArguments(["--confirm-project-ref", STAGING_PROJECT.ref, "--apply"]),
      {
        SUPABASE_URL: `https://${STAGING_PROJECT.ref}.supabase.co`,
        SUPABASE_SERVICE_ROLE_KEY: "generic-service-role",
        NODE_ENV: "test",
      } as NodeJS.ProcessEnv
    );

    expect(() =>
      openMutationGate(genericOnly, {
        target_ref: STAGING_PROJECT.ref,
        target_environment: STAGING_PROJECT.name,
      })
    ).toThrow(/generic supabase fallback/i);
  });

  it("rejects a production URL even with the staging confirmation ref", async () => {
    const {
      STAGING_PROJECT,
      PRODUCTION_PROJECT,
      buildTargetContext,
      parseArguments,
    } = await import("../../scripts/badges/staging-helpers/project-guard.mjs");

    expect(() =>
      buildTargetContext(
        parseArguments(["--confirm-project-ref", STAGING_PROJECT.ref]),
        {
          BADGE_E2E_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT.ref}.supabase.co`,
          NODE_ENV: "test",
        } as NodeJS.ProcessEnv
      )
    ).toThrow(/resolves to project/i);
  });

  it("blocks mutation helpers until --apply and passed preflight open the gate", async () => {
    const {
      STAGING_PROJECT,
      assertMutationGateOpen,
      buildTargetContext,
      openMutationGate,
      parseArguments,
    } = await import("../../scripts/badges/staging-helpers/project-guard.mjs");
    const { createFixtureContext } = await import(
      "../../scripts/badges/staging-helpers/fixtures.mjs"
    );

    const env = explicitStagingEnv(STAGING_PROJECT);
    const dryRunTarget = buildTargetContext(
      parseArguments(["--confirm-project-ref", STAGING_PROJECT.ref]),
      env
    );

    expect(() =>
      openMutationGate(dryRunTarget, {
        target_ref: STAGING_PROJECT.ref,
        target_environment: STAGING_PROJECT.name,
      })
    ).toThrow(/--apply is required/i);
    expect(() => assertMutationGateOpen(dryRunTarget)).toThrow(/not open/i);

    await expect(
      createFixtureContext({
        targetContext: dryRunTarget,
        runMarker: "badge-e2e-test",
        manifest: {},
      })
    ).rejects.toThrow(/not open/i);

    const appliedTarget = buildTargetContext(
      parseArguments(["--confirm-project-ref", STAGING_PROJECT.ref, "--apply"]),
      env
    );
    const gated = openMutationGate(appliedTarget, {
      target_ref: STAGING_PROJECT.ref,
      target_environment: STAGING_PROJECT.name,
    });
    expect(() => assertMutationGateOpen(gated)).not.toThrow();
  });

  it("persists manifest updates incrementally and rejects secret material", async () => {
    const previousCwd = process.cwd();
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "badge-e2e-manifest-"));
    process.chdir(temporaryDirectory);
    vi.resetModules();

    try {
      const manifestModuleUrl =
        `${pathToFileURL(resolve(previousCwd, "scripts/badges/staging-helpers/manifest.mjs")).href}?case=${Date.now()}`;
      const {
        createManifest,
        recordCreated,
        recordScenario,
        registerManifestSecretDenyList,
      } = await import(manifestModuleUrl);

      const manifest = createManifest({
        runMarker: "badge-e2e-test",
        projectRef: "zzbnneprhjicmajpjkdg",
        environment: "ironclad-staging",
      });
      registerManifestSecretDenyList(manifest, ["super-secret-value"]);
      recordCreated(manifest, "playerIds", "player-1");

      const written = JSON.parse(
        readFileSync(join(temporaryDirectory, "artifacts/badge-e2e/badge-e2e-test.json"), "utf8")
      );
      expect(written.created.playerIds).toEqual(["player-1"]);

      expect(() =>
        recordScenario(manifest, "redaction-probe", {
          note: "super-secret-value",
        })
      ).toThrow(/secret value/i);
    } finally {
      process.chdir(previousCwd);
      vi.resetModules();
    }
  });

  it("allows only known preflight diagnostic role issue keys", async () => {
    const previousCwd = process.cwd();
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "badge-e2e-manifest-diagnostics-"));
    process.chdir(temporaryDirectory);
    vi.resetModules();

    try {
      const manifestModuleUrl =
        `${pathToFileURL(resolve(previousCwd, "scripts/badges/staging-helpers/manifest.mjs")).href}?diagnostics=${Date.now()}`;
      const { createManifest, writeManifest } = await import(manifestModuleUrl);
      const manifest = createManifest({
        runMarker: "badge-e2e-diagnostics",
        projectRef: "zzbnneprhjicmajpjkdg",
        environment: "ironclad-staging",
      });
      manifest.preflight = {
        service_role_table_issues: ["public.example"],
        service_role_table_mutation_issues: [],
        service_role_function_issues: [],
      };

      expect(() => writeManifest(manifest)).not.toThrow();
      expect(() => {
        manifest.preflight.service_role_key = "credential-shaped-field";
        writeManifest(manifest);
      }).toThrow(/secret-shaped key/i);
    } finally {
      process.chdir(previousCwd);
      vi.resetModules();
    }
  });

  it("propagates manifest persistence failures", async () => {
    const previousCwd = process.cwd();
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "badge-e2e-manifest-failure-"));
    const blockingPath = join(temporaryDirectory, "artifacts");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(blockingPath, "not a directory", "utf8");
    process.chdir(temporaryDirectory);
    vi.resetModules();

    try {
      const manifestModuleUrl =
        `${pathToFileURL(resolve(previousCwd, "scripts/badges/staging-helpers/manifest.mjs")).href}?failure=${Date.now()}`;
      const { createManifest, recordCreated } = await import(manifestModuleUrl);
      const manifest = createManifest({
        runMarker: "badge-e2e-write-failure",
        projectRef: "zzbnneprhjicmajpjkdg",
        environment: "ironclad-staging",
      });

      expect(() => recordCreated(manifest, "playerIds", "player-1")).toThrow();
    } finally {
      process.chdir(previousCwd);
      vi.resetModules();
    }
  });

  it("builds cleanup plans only from manifest-recorded IDs", async () => {
    const { buildCleanupDryRunPlan } = await import(
      "../../scripts/badges/staging-helpers/manifest.mjs"
    );

    const plan = buildCleanupDryRunPlan({
      runMarker: "badge-e2e-test",
      created: {
        playerIds: ["player-1"],
        tournamentIds: ["tournament-1"],
        registrationIds: ["registration-1"],
        registrationAcceptanceIds: ["acceptance-1"],
        bracketIds: ["bracket-1"],
        generatedBracketIds: ["generated-1"],
        matchIds: ["match-1"],
        reportGroupIds: ["report-group-1"],
        submissionIds: ["submission-1"],
        seasonIds: ["season-1"],
        replayAttemptIds: ["replay-attempt-1"],
        storagePaths: ["badge-e2e-test/match/game.rec"],
      },
      cleanup: {
        eligibility: {
          "acceptance-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "bracket-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "generated-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "match-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "player-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "registration-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "replay-attempt-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "report-group-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "season-1": {
            classification: "MUST_RETAIN_AS_STAGING_HISTORY",
            reason: "test",
          },
          "submission-1": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
          "tournament-1": {
            classification: "MUST_RETAIN_AS_STAGING_HISTORY",
            reason: "test",
          },
          "badge-e2e-test/match/game.rec": {
            classification: "SAFE_TO_DELETE",
            reason: "test",
          },
        },
      },
    });

    expect(plan.map((entry) => entry.id)).toEqual([
      "badge-e2e-test/match/game.rec",
      "report-group-1",
      "replay-attempt-1",
      "submission-1",
      "acceptance-1",
      "registration-1",
      "match-1",
      "generated-1",
      "bracket-1",
      "player-1",
    ]);
    expect(plan.every((entry) => entry.wouldMutate === false)).toBe(true);
  });

  it("rejects cleanup manifests with another run marker in storage paths", async () => {
    const { buildCleanupDryRunPlan } = await import(
      "../../scripts/badges/staging-helpers/manifest.mjs"
    );

    expect(() =>
      buildCleanupDryRunPlan({
        runMarker: "badge-e2e-current",
        created: {
          storagePaths: ["badge-e2e-other/match/game.rec"],
        },
        cleanup: {
          eligibility: {
            "badge-e2e-other/match/game.rec": {
              classification: "SAFE_TO_DELETE",
              reason: "test",
            },
          },
        },
      })
    ).toThrow(/outside run/i);
  });

  it("reclassifies launched-history players and registrations as retained", async () => {
    const { buildCleanupDryRunPlan, protectLaunchedHistory } = await import(
      "../../scripts/badges/staging-helpers/manifest.mjs"
    );
    const manifest = {
      runMarker: "badge-e2e-history",
      created: {
        playerIds: ["player-history"],
        registrationIds: ["registration-history"],
        tournamentIds: ["tournament-history"],
        storagePaths: [],
      },
      cleanup: {
        eligibility: {
          "player-history": { classification: "SAFE_TO_DELETE" },
          "registration-history": { classification: "FAILED_BEFORE_LAUNCH" },
          "tournament-history": { classification: "FAILED_BEFORE_LAUNCH" },
        },
      },
    };

    protectLaunchedHistory(manifest, {
      playerIds: ["player-history"],
      registrationIds: ["registration-history"],
      tournamentIds: ["tournament-history"],
    });

    expect(manifest.cleanup.eligibility["player-history"].classification).toBe(
      "MUST_RETAIN_AS_STAGING_HISTORY"
    );
    expect(
      manifest.cleanup.eligibility["registration-history"].classification
    ).toBe("MUST_RETAIN_AS_STAGING_HISTORY");
    expect(buildCleanupDryRunPlan(manifest)).toEqual([]);
  });

  it("fails security coverage when the authenticated JWT is invalid", async () => {
    const { verifyAuthenticatedJwtContext } = await import(
      "../../scripts/badges/staging-helpers/assertions.mjs"
    );
    const query = (result: unknown) => ({
      select: () => ({
        eq: () => ({ limit: async () => result }),
        limit: async () => result,
      }),
    });
    const ctx = {
      authenticatedSubject: "clerk-test-user",
      manifest: { securityAssertions: [] },
      anon: {
        from: () => query({
          data: null,
          error: { code: "42501", message: "permission denied" },
        }),
      },
      authenticated: {
        from: () => query({
          data: null,
          error: { code: "PGRST301", message: "JWT expired" },
        }),
      },
    };

    await expect(verifyAuthenticatedJwtContext(ctx)).rejects.toThrow(
      /not accepted|jwt/i
    );
  });

  it("propagates fixture creation failures and does not set profile_completed directly", async () => {
    const {
      STAGING_PROJECT,
      buildTargetContext,
      openMutationGate,
      parseArguments,
    } = await import("../../scripts/badges/staging-helpers/project-guard.mjs");
    const { createManifest } = await import(
      "../../scripts/badges/staging-helpers/manifest.mjs"
    );
    const { createFixturePlayer } = await import(
      "../../scripts/badges/staging-helpers/fixtures.mjs"
    );

    const target = buildTargetContext(
      parseArguments(["--confirm-project-ref", STAGING_PROJECT.ref, "--apply"]),
      explicitStagingEnv(STAGING_PROJECT)
    );
    const gated = openMutationGate(target, {
      target_ref: STAGING_PROJECT.ref,
      target_environment: STAGING_PROJECT.name,
    });
    const ctx = {
      manifest: createManifest({
        runMarker: "badge-e2e-failure-test",
        projectRef: STAGING_PROJECT.ref,
        environment: STAGING_PROJECT.name,
      }),
      mutationGate: gated.mutationGate,
      project: STAGING_PROJECT,
      runMarker: "badge-e2e-failure-test",
      syntheticFixtureSecret: "test-secret",
      supabase: {
        rpc: vi.fn(async () => ({ data: null, error: { message: "insert failed" } })),
        from(table: string) {
          throw new Error(`unexpected table ${table}`);
        },
      },
    };

    await expect(createFixturePlayer(ctx, { label: "failure" })).rejects.toThrow(
      /fixture player creation failed/i
    );
  });

  it("does not contain a harness-local player_badge_awards mutation path", async () => {
    const files = await listFiles(resolve("scripts/badges"));
    const matches: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (source.includes("persistBadgeAward")) {
        matches.push(`${file}:persistBadgeAward`);
      }
      const forbidden = source.match(
        /\.from\(\s*["']player_badge_awards["']\s*\)[\s\S]{0,240}\.(?:insert|upsert|update|delete)\s*\(/g
      );
      for (const match of forbidden ?? []) {
        matches.push(`${file}:${match}`);
      }
    }

    expect(matches).toEqual([]);
  });

  it("does not shortcut protected authority or season ledgers", async () => {
    const files = await listFiles(resolve("scripts/badges"));
    const forbidden: string[] = [];
    const writePattern =
      /\.from\(\s*["'](player_badge_awards|match_game_result_authority|match_participant_outcome_authority|tournament_championship_path_authority|tournament_championship_path_summary_authority|leaderboard_player_season_stats|leaderboard_season_champions)["']\s*\)[\s\S]{0,320}\.(insert|upsert|update|delete)\s*\(/g;

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/persistBadgeAward/i.test(source)) {
        forbidden.push(`${file}:persistBadgeAward`);
      }
      if (/hardcoded\s+PASS/i.test(source) || /\breturn\s+true\b/.test(source)) {
        forbidden.push(`${file}:hardcoded-pass-shortcut`);
      }

      for (const match of source.matchAll(writePattern)) {
        const table = match[1];
        const operation = match[2];
        const window = source.slice(
          Math.max(0, (match.index ?? 0) - 500),
          (match.index ?? 0) + match[0].length + 120
        );
        const securityProbe =
          operation === "insert" &&
          /expectPermissionFailure\(/.test(window);

        if (
          table === "match_game_result_authority" ||
          table === "match_participant_outcome_authority" ||
          table === "tournament_championship_path_authority" ||
          table === "tournament_championship_path_summary_authority"
        ) {
          if (!securityProbe) {
            forbidden.push(`${file}:${table}:${operation}`);
          }
          continue;
        }

        forbidden.push(`${file}:${table}:${operation}`);
      }
    }

    expect(forbidden).toEqual([]);
  });

  it("preflight declares exact signatures, return types, and table column types", async () => {
    const {
      REQUIRED_FUNCTION_NAMES,
      REQUIRED_FUNCTION_RETURNS,
      REQUIRED_FUNCTION_SIGNATURES,
      REQUIRED_TABLE_COLUMN_TYPES,
    } = await import("../../scripts/badges/staging-helpers/preflight.mjs");

    expect(REQUIRED_FUNCTION_SIGNATURES).toHaveLength(
      REQUIRED_FUNCTION_NAMES.length
    );
    expect(REQUIRED_FUNCTION_RETURNS).toHaveLength(REQUIRED_FUNCTION_NAMES.length);
    expect(REQUIRED_FUNCTION_SIGNATURES).toContainEqual([
      "submit_verified_player_registration",
      expect.stringContaining("p_relic_elo bigint"),
    ]);
    expect(REQUIRED_FUNCTION_RETURNS).toContainEqual([
      "get_player_badge_flawless_campaign_summary",
      expect.stringContaining("verified_game_count integer"),
    ]);
    expect(REQUIRED_FUNCTION_SIGNATURES).toContainEqual([
      "process_matchup_deadlines",
      "p_limit integer",
    ]);
    expect(REQUIRED_FUNCTION_RETURNS).toContainEqual([
      "process_matchup_deadlines",
      "jsonb",
    ]);
    expect(REQUIRED_TABLE_COLUMN_TYPES).toContainEqual([
      "public.players",
      "profile_completed",
      "boolean",
    ]);
  });

  it("fail-closes the complete Badge Reveal migration and database contract", async () => {
    const {
      FORCE_RLS_TABLES,
      REQUIRED_BADGE_MIGRATIONS,
      REQUIRED_REVEAL_COLUMN_CONTRACTS,
      REQUIRED_REVEAL_CONSTRAINTS,
      REQUIRED_REVEAL_INDEXES,
      REQUIRED_TABLES,
      assertPreflightResult,
      buildPreflightSql,
    } = await import("../../scripts/badges/staging-helpers/preflight.mjs");

    expect(REQUIRED_BADGE_MIGRATIONS).toEqual([
      "20260821000000",
      "20260821001000",
      "20260821002000",
      "20260821003000",
      "20260821004000",
      "20260821005000",
      "20260821006000",
      "20260821007000",
      "20260821008000",
      "20260821009000",
      "20260821010000",
      "20260830090000",
      "20260831090000",
      "20260831100000",
    ]);
    expect(REQUIRED_TABLES).toContain("public.player_badge_reveals");
    expect(FORCE_RLS_TABLES).toContain("public.player_badge_reveals");
    expect(REQUIRED_REVEAL_COLUMN_CONTRACTS).toEqual([
      {
        table: "public.player_badge_reveals",
        column: "id",
        type: "uuid",
        notNull: true,
        defaultExpression: "gen_random_uuid()",
      },
      {
        table: "public.player_badge_reveals",
        column: "player_badge_award_id",
        type: "uuid",
        notNull: true,
        defaultExpression: null,
      },
      {
        table: "public.player_badge_reveals",
        column: "player_id",
        type: "uuid",
        notNull: true,
        defaultExpression: null,
      },
      {
        table: "public.player_badge_reveals",
        column: "revealed_at",
        type: "timestamp with time zone",
        notNull: true,
        defaultExpression: "clock_timestamp()",
      },
      {
        table: "public.player_badge_reveals",
        column: "created_at",
        type: "timestamp with time zone",
        notNull: true,
        defaultExpression: "clock_timestamp()",
      },
    ]);

    expect(REQUIRED_REVEAL_CONSTRAINTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "public.player_badge_awards",
          name: "player_badge_awards_id_player_unique",
          type: "u",
          definitionFragments: ["UNIQUE (id, player_id)"],
        }),
        expect.objectContaining({
          table: "public.player_badge_reveals",
          name: "player_badge_reveals_pkey",
          type: "p",
          definitionFragments: ["PRIMARY KEY (id)"],
        }),
        expect.objectContaining({
          table: "public.player_badge_reveals",
          name: "player_badge_reveals_player_id_fkey",
          type: "f",
          definitionFragments: [
            "FOREIGN KEY (player_id)",
            "REFERENCES players(id)",
            "ON DELETE CASCADE",
          ],
        }),
        expect.objectContaining({
          table: "public.player_badge_reveals",
          name: "player_badge_reveals_award_unique",
          type: "u",
          definitionFragments: ["UNIQUE (player_badge_award_id)"],
        }),
        expect.objectContaining({
          table: "public.player_badge_reveals",
          name: "player_badge_reveals_owned_award_fk",
          type: "f",
          definitionFragments: [
            "FOREIGN KEY (player_badge_award_id, player_id)",
            "REFERENCES player_badge_awards(id, player_id)",
            "ON DELETE CASCADE",
          ],
        }),
      ])
    );
    expect(REQUIRED_REVEAL_INDEXES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "player_badge_awards_id_player_unique",
          unique: true,
          definitionFragments: ["(id, player_id)"],
        }),
        expect.objectContaining({
          name: "player_badge_reveals_pkey",
          unique: true,
          definitionFragments: ["(id)"],
        }),
        expect.objectContaining({
          name: "player_badge_reveals_award_unique",
          unique: true,
          definitionFragments: ["(player_badge_award_id)"],
        }),
        expect.objectContaining({
          name: "player_badge_reveals_player_revealed_idx",
          unique: false,
          definitionFragments: ["(player_id, revealed_at DESC)"],
        }),
      ])
    );

    const sql = buildPreflightSql();
    expect(sql).toContain("20260830090000");
    expect(sql).toContain("required_reveal_column_contracts");
    expect(sql).toContain("required_reveal_constraints");
    expect(sql).toContain("required_reveal_indexes");

    for (const failureKey of [
      "missing_migrations",
      "missing_tables",
      "reveal_column_contract_issues",
      "reveal_constraint_issues",
      "reveal_index_issues",
      "rls_issues",
      "force_rls_issues",
    ]) {
      expect(sql).toContain(`'${failureKey}'`);
      expect(() =>
        assertPreflightResult({
          target_ref: "zzbnneprhjicmajpjkdg",
          target_environment: "ironclad-staging",
          [failureKey]: ["intentional-test-failure"],
        })
      ).toThrow(new RegExp(failureKey));
    }
  });

  it("keeps direct service-role mutation checks least-privilege while retaining table reads", async () => {
    const { REQUIRED_TABLES, SERVICE_ROLE_MUTATION_TABLES } = await import(
      "../../scripts/badges/staging-helpers/preflight.mjs"
    );

    expect(REQUIRED_TABLES).toContain(
      "public.leaderboard_tournament_season_memberships"
    );
    expect(REQUIRED_TABLES).toContain("public.registrations");
    expect(SERVICE_ROLE_MUTATION_TABLES).not.toContain(
      "public.leaderboard_tournament_season_memberships"
    );
    expect(SERVICE_ROLE_MUTATION_TABLES).not.toContain("public.registrations");
    expect(SERVICE_ROLE_MUTATION_TABLES).toContain("public.players");
    expect(SERVICE_ROLE_MUTATION_TABLES).toContain("public.tournaments");
    expect(SERVICE_ROLE_MUTATION_TABLES).toContain("public.player_badge_awards");
  });

  it("validates Badge Reveal RLS ownership policies and exact grants", async () => {
    const {
      REQUIRED_REVEAL_GRANTS,
      REQUIRED_REVEAL_POLICIES,
      assertPreflightResult,
      buildPreflightSql,
    } = await import("../../scripts/badges/staging-helpers/preflight.mjs");

    expect(REQUIRED_REVEAL_POLICIES).toHaveLength(2);
    const policyCommands: string[] = REQUIRED_REVEAL_POLICIES.map(
      (policy) => policy.command
    );
    expect(policyCommands).toEqual(["SELECT", "INSERT"]);
    expect(
      REQUIRED_REVEAL_POLICIES.every(
        (policy) =>
          policy.roles.length === 1 && policy.roles[0] === "authenticated"
      )
    ).toBe(true);

    const selectPolicy = REQUIRED_REVEAL_POLICIES.find(
      (policy) => policy.command === "SELECT"
    );
    const insertPolicy = REQUIRED_REVEAL_POLICIES.find(
      (policy) => policy.command === "INSERT"
    );
    const ownershipFragments = [
      "player.id = player_badge_reveals.player_id",
      "player.clerk_user_id = (auth.jwt() ->> 'sub'::text)",
    ];
    expect(selectPolicy?.usingFragments).toEqual(ownershipFragments);
    expect(selectPolicy?.withCheckFragments).toEqual([]);
    expect(insertPolicy?.usingFragments).toEqual([]);
    expect(insertPolicy?.withCheckFragments).toEqual(ownershipFragments);
    expect(policyCommands).not.toContain("UPDATE");
    expect(policyCommands).not.toContain("DELETE");

    expect(REQUIRED_REVEAL_GRANTS).toEqual({
      authenticatedTable: ["SELECT"],
      authenticatedColumns: [
        "player_badge_award_id:INSERT",
        "player_id:INSERT",
      ],
      anonTableOrColumns: [],
      publicTableOrColumns: [],
      serviceRoleTable: [
        "DELETE",
        "INSERT",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE",
      ],
    });

    const sql = buildPreflightSql();
    expect(sql).toContain("required_reveal_policies");
    expect(sql).toContain("found.roles::text[] = required.roles");
    expect(sql).not.toContain("found.roles = required.roles");
    expect(
      sql.match(/found\.roles(?:::text\[\])?\s*=\s*required\.roles/g)
    ).toEqual(["found.roles::text[] = required.roles"]);
    expect(sql).toContain("ARRAY['authenticated']::text[]");
    expect(sql).not.toMatch(
      /found\.roles(?:::text\[\])?\s*(?:@>|<@)\s*required\.roles/
    );
    expect(sql).toContain("cardinality(required.using_fragments) = 0");
    expect(sql).toContain("cardinality(required.with_check_fragments) = 0");
    expect(sql).toContain("found.using_expression ilike '% and %'");
    expect(sql).toContain("found.with_check_expression ilike '% and %'");
    expect(sql).toContain("player.clerk_user_id = (auth.jwt() ->> ''sub''::text)");
    expect(sql).toContain("player.id = player_badge_reveals.player_id");
    expect(sql).toContain("'authenticated_table_grants'");
    expect(sql).toContain("'authenticated_column_grants'");
    expect(sql).toContain("'anon_table_or_column_grants'");
    expect(sql).toContain("'anon_effective_privileges'");
    expect(sql).toContain("'anon_or_authenticated_bypass_rls'");
    expect(sql).toContain("'public_table_or_column_grants'");
    expect(sql).toContain("'authenticated_effective_privileges'");
    expect(sql).toContain("'service_role_table_grants'");
    expect(sql).toContain("'service_role_effective_privileges'");
    expect(sql).toContain("'service_role_bypass_rls'");

    for (const failureKey of ["reveal_policy_issues", "reveal_grant_issues"]) {
      expect(() =>
        assertPreflightResult({
          target_ref: "zzbnneprhjicmajpjkdg",
          target_environment: "ironclad-staging",
          [failureKey]: ["intentional-test-failure"],
        })
      ).toThrow(new RegExp(failureKey));
    }
  });

  it("keeps ACL explosion one-dimensional and NULL-safe", async () => {
    const { buildPreflightSql } = await import(
      "../../scripts/badges/staging-helpers/preflight.mjs"
    );
    const sql = buildPreflightSql();

    expect(sql.match(/pg_catalog\.aclexplode\(/g)).toHaveLength(2);
    expect(sql).toContain(
      "coalesce(class.relacl, pg_catalog.acldefault('r', class.relowner))"
    );
    expect(sql).toContain("pg_catalog.aclexplode(attribute.attacl)");
    expect(sql).not.toContain(
      "coalesce(attribute.attacl, '{}'::aclitem[])"
    );
    expect(sql).not.toMatch(
      /pg_catalog\.aclexplode\([\s\S]{0,160}(?:array_agg|array\s*\[|\{\}'::aclitem\[\])/i
    );

    for (const expectedCheck of [
      "from table_acl_catalog",
      "from column_acl_catalog",
      "grantee = 'authenticated'",
      "grantee = 'anon'",
      "grantee = 'public'",
      "grantee = 'service_role'",
      "'authenticated_table_grants'",
      "'authenticated_column_grants'",
      "'anon_effective_privileges'",
      "'service_role_table_grants'",
    ]) {
      expect(sql).toContain(expectedCheck);
    }

    expect(sql.trimStart()).toMatch(/^with\b/i);
    expect(sql).not.toMatch(
      /^\s*(?:alter|create|delete|drop|grant|insert|revoke|truncate|update)\b/im
    );
  });
});

function explicitStagingEnv(project: { ref: string }): NodeJS.ProcessEnv {
  return {
    BADGE_E2E_STAGING_SUPABASE_URL: `https://${project.ref}.supabase.co`,
    BADGE_E2E_STAGING_SERVICE_ROLE_KEY: "test-service-role-key",
    BADGE_E2E_STAGING_ANON_KEY: "test-anon-key",
    BADGE_E2E_STAGING_AUTHENTICATED_JWT:
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJjbGVyay10ZXN0LXVzZXIifQ.",
    BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN: "test-access-token",
    BADGE_E2E_STAGING_SYNTHETIC_FIXTURE_SECRET: "test-synthetic-fixture-secret",
    NODE_ENV: "test",
  } as NodeJS.ProcessEnv;
}

function badge20ResumeManifest(
  createState: (input: Record<string, unknown>) => Record<string, unknown>,
  projectRef: string
) {
  const runMarker = "badge-e2e-resume-test";
  const ids = badge20ResumeIds();
  const state = createState({
    runMarker,
    projectRef,
    ...ids,
    expectedDeadline: "2026-09-05T12:00:00.000Z",
    phase: "WAITING_FOR_REAL_DEADLINE",
  });
  return {
    schemaVersion: 1,
    runMarker,
    projectRef,
    environment: "ironclad-staging",
    created: {
      playerIds: [ids.playerId],
      tournamentIds: [ids.tournamentId],
      registrationIds: ids.registrationIds,
      bracketIds: [ids.divisionId],
      generatedBracketIds: [ids.generatedBracketId],
      matchIds: [
        ids.championQuarterfinalId,
        ids.untouchedQuarterfinalId,
        ids.automaticByeMatchId,
        ...ids.oppositeQuarterfinalIds,
        ids.oppositeSemifinalId,
        ids.finalMatchId,
      ],
    },
    scenarios: {
      "flawless-automatic-bye-positive": state,
    },
  };
}

function badge20ResumeIds() {
  const id = (suffix: number) =>
    `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
  return {
    playerId: id(1),
    championRegistrationId: id(2),
    tournamentId: id(3),
    divisionId: id(4),
    tournamentBracketId: id(4),
    generatedBracketId: id(5),
    registrationIds: [
      id(2),
      ...Array.from({ length: 7 }, (_, index) => id(10 + index)),
    ],
    championQuarterfinalId: id(20),
    untouchedQuarterfinalId: id(21),
    automaticByeMatchId: id(22),
    oppositeQuarterfinalIds: [id(23), id(24)],
    oppositeSemifinalId: id(25),
    finalMatchId: id(26),
  };
}

function fixtureMatch(input: {
  id: string;
  playerId: string;
  registrationId: string;
}) {
  return {
    id: input.id,
    player_one_registration_id: input.registrationId,
    player_two_registration_id: `${input.registrationId}-opponent`,
    player_one: {
      id: input.registrationId,
      profile_id: input.playerId,
    },
    player_two: {
      id: `${input.registrationId}-opponent`,
      profile_id: `${input.playerId}-opponent`,
    },
  };
}

function gatedHarnessContext() {
  return {
    runMarker: "badge-e2e-behavior",
    project: {
      name: "ironclad-staging",
      ref: "zzbnneprhjicmajpjkdg",
    },
    mutationGate: {
      state: "OPEN",
      projectRef: "zzbnneprhjicmajpjkdg",
      preflightTargetRef: "zzbnneprhjicmajpjkdg",
    },
    manifest: { scenarios: {} },
  };
}

function automaticByeTopology() {
  const match = (id: string, round: number, matchNumber: number) => ({
    id,
    match_number: matchNumber,
    player_one_registration_id: `${id}-player-one`,
    player_two_registration_id: `${id}-player-two`,
    bracket_rounds: { round_number: round },
  });
  return [
    match("qf-1", 1, 1),
    match("qf-2", 1, 2),
    match("qf-3", 1, 3),
    match("qf-4", 1, 4),
    match("sf-1", 2, 1),
    match("sf-2", 2, 2),
    match("final", 3, 1),
  ];
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    })
  );
  return files.flat();
}

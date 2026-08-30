import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { recordEvaluatorInvocation } from "./manifest.mjs";
import { assertMutationGateOpen } from "./project-guard.mjs";

let authorityModulePromise = null;
let loaderRegistered = false;

export async function evaluateProductionBadges(ctx, input) {
  assertMutationGateOpen(ctx);

  const authority = await loadProductionAuthority(ctx);
  const evaluationMode = input.evaluationMode ?? "live";
  const results = [];

  if (input.kind === "profile") {
    results.push(
      await authority.evaluateProfileBadgeAwards({
        playerId: input.playerId,
        supabase: ctx.supabase,
        evaluationMode,
      })
    );
  } else if (input.kind === "match") {
    results.push(
      await authority.evaluateMatchBadgeAwardsForMatch({
        matchId: input.matchId,
        supabase: ctx.supabase,
        evaluationMode,
      }),
      await authority.evaluateTournamentBadgeAwardsForMatch({
        matchId: input.matchId,
        supabase: ctx.supabase,
        evaluationMode,
      })
    );
  } else if (input.kind === "report-group") {
    results.push(
      await authority.evaluateMatchBadgeAwardsForReportGroup({
        reportGroupId: input.reportGroupId,
        supabase: ctx.supabase,
      }),
      await authority.evaluateTournamentBadgeAwardsForReportGroup({
        reportGroupId: input.reportGroupId,
        supabase: ctx.supabase,
      })
    );
  } else if (input.kind === "tournament") {
    results.push(
      await authority.evaluateTournamentBadgeAwardsForTournament({
        tournamentId: input.tournamentId,
        supabase: ctx.supabase,
        evaluationMode,
      })
    );
  } else if (input.kind === "season") {
    results.push(
      await authority.evaluateSeasonBadgeAwardsForSeason({
        seasonId: input.seasonId,
        supabase: ctx.supabase,
        evaluationMode,
      })
    );
  } else if (input.kind === "player") {
    results.push(
      await authority.evaluateProfileBadgeAwards({
        playerId: input.playerId,
        supabase: ctx.supabase,
        evaluationMode,
      }),
      await authority.evaluateMatchBadgeAwardsForPlayer({
        playerId: input.playerId,
        supabase: ctx.supabase,
        evaluationMode,
      }),
      await authority.evaluateTournamentBadgeAwardsForPlayer({
        playerId: input.playerId,
        supabase: ctx.supabase,
        evaluationMode,
      }),
      await authority.evaluateSeasonBadgeAwardsForPlayer({
        playerId: input.playerId,
        supabase: ctx.supabase,
        evaluationMode,
      })
    );
  } else if (input.kind === "backfill") {
    const result = await authority.backfillInitialBadgeAwards({
      supabase: ctx.supabase,
      playerIds: input.playerIds,
    });
    if (result.errors.length > 0) {
      throw new Error(
        `Production badge backfill failed for ${result.errors
          .map((error) => `${error.playerId}:${error.code}`)
          .join(", ")}`
      );
    }
    results.push({
      createdCount: result.awardsCreated,
      createdSlugs: Object.entries(result.badgeCounts)
        .filter(([, count]) => count > 0)
        .flatMap(([slug, count]) => Array.from({ length: count }, () => slug)),
      evaluatedSlugs: Object.keys(result.badgeCounts),
      skippedReasons: [],
    });
  } else {
    throw new Error(`Unknown production badge evaluator kind: ${input.kind}`);
  }

  const merged = mergeEvaluationResults(results);
  recordEvaluatorInvocation(ctx.manifest, {
    kind: input.kind,
    scenario: input.scenario ?? null,
    playerId: input.playerId ?? null,
    playerIds: input.playerIds ?? null,
    matchId: input.matchId ?? null,
    reportGroupId: input.reportGroupId ?? null,
    tournamentId: input.tournamentId ?? null,
    seasonId: input.seasonId ?? null,
    evaluationMode,
    createdCount: merged.createdCount,
    createdSlugs: merged.createdSlugs,
    evaluatedSlugs: merged.evaluatedSlugs,
    skippedReasons: merged.skippedReasons,
  });

  return merged;
}

export async function evaluateAllProductionBadgesForPlayer(
  ctx,
  playerId,
  scenario,
  evaluationMode = "live"
) {
  return evaluateProductionBadges(ctx, {
    kind: "player",
    playerId,
    scenario,
    evaluationMode,
  });
}

export function evaluatorTouchedSlug(ctx, playerId, badgeSlug, scenario) {
  return ctx.manifest.evaluatorInvocations.some(
    (invocation) =>
      (invocation.playerId === playerId ||
        (scenario && invocation.scenario === scenario)) &&
      Array.isArray(invocation.evaluatedSlugs) &&
      invocation.evaluatedSlugs.includes(badgeSlug)
  );
}

async function loadProductionAuthority(ctx) {
  configureRuntimeEnvironment(ctx);

  if (!loaderRegistered) {
    register(
      pathToFileURL(
        resolve("scripts", "badges", "staging-helpers", "ts-loader.mjs")
      ),
      import.meta.url
    );
    loaderRegistered = true;
  }

  if (!authorityModulePromise) {
    authorityModulePromise = import(
      pathToFileURL(resolve("lib", "badges", "authority.ts")).href
    );
  }

  return authorityModulePromise;
}

function configureRuntimeEnvironment(ctx) {
  const environment = ctx.harnessEnvironment;
  if (!environment?.supabaseUrl || !environment?.anonKey) {
    throw new Error("Production badge evaluator bridge has no staging environment.");
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = environment.supabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = environment.anonKey;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    environment.anonKey;

  if (environment.serviceRoleKey) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = environment.serviceRoleKey;
  }
}

function mergeEvaluationResults(results) {
  return {
    createdCount: results.reduce(
      (total, result) => total + Number(result.createdCount ?? 0),
      0
    ),
    createdSlugs: results.flatMap((result) => result.createdSlugs ?? []),
    evaluatedSlugs: [
      ...new Set(results.flatMap((result) => result.evaluatedSlugs ?? [])),
    ],
    skippedReasons: results.flatMap((result) => result.skippedReasons ?? []),
  };
}

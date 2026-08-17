import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AdminPolls, {
  type AdminPollMap,
  type AdminPollPlayer,
  type AdminPollTournament,
  type AdminPollView,
} from "@/components/AdminPolls";
import {
  parsePollListProjection,
  parseSinglePollProjection,
  POLL_LIMITS,
  type PollViewerProjection,
} from "@/lib/polls";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type AdminPollsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TournamentRow = {
  id: string;
  title: string;
  status: string;
  tournament_brackets: { id: string; name: string }[] | null;
};

type PlayerRow = {
  id: string;
  display_name: string;
  in_game_name: string;
};

type RegistrationRow = {
  profile_id: string | null;
  tournament_id: string;
  tournament_bracket_id: string | null;
};

type MapRow = {
  id: string;
  slug: string;
  display_name: string;
};

type PoolEntryRow = {
  tournament_bracket_id: string;
  coh3_map_id: string;
};

export default async function AdminPollsPage({
  searchParams,
}: AdminPollsPageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (
    sessionClaims as { metadata?: { role?: string } } | null
  )?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const requestedPollId = uuidOrUndefined(single(params.selected));
  const contextTournamentId = uuidOrUndefined(single(params.tournament));
  const supabase = createSupabaseAdminClient();
  const [
    pollListResult,
    tournamentResult,
    playerResult,
    registrationResult,
    mapResult,
    poolEntryResult,
  ] = await Promise.all([
    supabase.rpc("list_admin_polls", {
      p_tournament_id: contextTournamentId ?? null,
    }),
    supabase
      .from("tournaments")
      .select("id, title, status, tournament_brackets(id, name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("players")
      .select("id, display_name, in_game_name")
      .is("account_closed_at", null)
      .order("in_game_name", { ascending: true }),
    supabase
      .from("registrations")
      .select("profile_id, tournament_id, tournament_bracket_id")
      .eq("registration_status", "approved")
      .not("profile_id", "is", null),
    supabase
      .from("coh3_maps")
      .select("id, slug, display_name")
      .eq("status", "active")
      .eq("game_mode", "1v1")
      .order("display_name", { ascending: true }),
    supabase
      .from("tournament_bracket_map_pool_entries")
      .select("tournament_bracket_id, coh3_map_id")
      .is("removed_at", null),
  ]);

  if (pollListResult.error) {
    logAdminPollLoadFailure("poll-list", pollListResult.error);
  }
  if (tournamentResult.error) {
    logAdminPollLoadFailure("tournaments", tournamentResult.error);
  }
  if (playerResult.error) {
    logAdminPollLoadFailure("players", playerResult.error);
  }
  if (registrationResult.error) {
    logAdminPollLoadFailure("registrations", registrationResult.error);
  }
  if (mapResult.error) {
    logAdminPollLoadFailure("maps", mapResult.error);
  }
  if (poolEntryResult.error) {
    logAdminPollLoadFailure("map-pools", poolEntryResult.error);
  }

  let polls = parsePollList(pollListResult.data);
  if (requestedPollId) {
    const detailResult = await supabase.rpc("get_admin_poll", {
      p_poll_id: requestedPollId,
    });
    if (detailResult.error) {
      logAdminPollLoadFailure("poll-detail", detailResult.error);
    } else {
      const detail = parsePollDetail(detailResult.data);
      if (detail) {
        polls = [detail, ...polls.filter((poll) => poll.id !== detail.id)];
      }
    }
  }

  const activePlayers = ((playerResult.data ?? []) as PlayerRow[]).map(
    (player): AdminPollPlayer => ({
      id: player.id,
      displayName: player.display_name,
      inGameName: player.in_game_name,
    })
  );
  const activePlayerById = new Map(
    activePlayers.map((player) => [player.id, player])
  );
  const registrations = (registrationResult.data ?? []) as RegistrationRow[];
  const currentMapIdsByBracket = new Map<string, string[]>();
  for (const entry of (poolEntryResult.data ?? []) as PoolEntryRow[]) {
    const current = currentMapIdsByBracket.get(entry.tournament_bracket_id) ?? [];
    if (!current.includes(entry.coh3_map_id)) current.push(entry.coh3_map_id);
    currentMapIdsByBracket.set(entry.tournament_bracket_id, current);
  }
  const tournaments = ((tournamentResult.data ?? []) as TournamentRow[]).map(
    (tournament): AdminPollTournament => ({
      id: tournament.id,
      title: tournament.title,
      status: tournament.status,
      brackets: (tournament.tournament_brackets ?? []).map((bracket) => ({
        id: bracket.id,
        name: bracket.name,
        currentMapIds: currentMapIdsByBracket.get(bracket.id) ?? [],
      })),
      approvedPlayers: registrations
        .filter((registration) => registration.tournament_id === tournament.id)
        .flatMap((registration) => {
          const player = registration.profile_id
            ? activePlayerById.get(registration.profile_id)
            : undefined;
          return player
            ? [
                {
                  ...player,
                  bracketId: registration.tournament_bracket_id,
                },
              ]
            : [];
        }),
    })
  );
  const activeMaps = ((mapResult.data ?? []) as MapRow[]).map(
    (map): AdminPollMap => ({
      id: map.id,
      slug: map.slug,
      displayName: map.display_name,
    })
  );
  const now = new Date();
  const defaultOpen = new Date(Math.ceil(now.getTime() / 900_000) * 900_000);
  const defaultClose = new Date(
    defaultOpen.getTime() + POLL_LIMITS.defaultDurationMilliseconds
  );
  const eligible = nonNegativeInteger(single(params.eligible));
  const configurationLoadFailed = Boolean(
    pollListResult.error ||
      tournamentResult.error ||
      playerResult.error ||
      registrationResult.error ||
      mapResult.error ||
      poolEntryResult.error
  );

  return (
    <AdminPolls
      key={requestedPollId ?? `new-${contextTournamentId ?? "community"}`}
      polls={polls}
      tournaments={tournaments}
      activePlayers={activePlayers}
      activeMaps={activeMaps}
      selectedPollId={requestedPollId}
      contextTournamentId={contextTournamentId}
      defaultOpensAt={defaultOpen.toISOString()}
      defaultClosesAt={defaultClose.toISOString()}
      notice={single(params.notice) || undefined}
      detail={single(params.detail) || undefined}
      eligibleCountResult={eligible ?? undefined}
      configurationLoadFailed={configurationLoadFailed}
    />
  );
}

function parsePollList(value: unknown): AdminPollView[] {
  const parsed = parsePollListProjection(value, "admin");
  return parsed?.polls.map(mapAdminPoll) ?? [];
}

function parsePollDetail(value: unknown): AdminPollView | null {
  const parsed = parseSinglePollProjection(value, "admin");
  return parsed ? mapAdminPoll(parsed) : null;
}

function mapAdminPoll(poll: PollViewerProjection): AdminPollView {
  return {
    id: poll.id,
    purpose: poll.purpose,
    audienceKind: poll.audienceKind,
    tournamentId: poll.tournamentId,
    tournamentBracketId: poll.tournamentBracketId,
    question: poll.question,
    context: poll.context,
    optionSource: poll.optionSource,
    maxSelections: poll.maxSelections,
    winnerCount: poll.winnerCount,
    authority: poll.authority,
    resultVisibility: poll.resultVisibility,
    publicFinalTotals: poll.publicFinalTotals,
    draftAudienceInvalidated: poll.draftAudienceInvalidated ?? false,
    opensAt: poll.opensAt,
    closesAt: poll.closesAt,
    publishedAt: poll.publishedAt,
    cancelledAt: poll.cancelledAt,
    cancellationReason: poll.cancellationReason,
    finalDecisionPublishedAt: poll.finalDecisionPublishedAt,
    finalDecisionBasis: poll.finalDecisionBasis,
    finalRationale: poll.finalRationale,
    bindingTieRuleUsed: poll.bindingTieRuleUsed,
    status: poll.status,
    frozenEligibleCount: poll.eligibleCount ?? 0,
    submittedBallotCount: poll.submittedBallotCount ?? 0,
    selectedPlayerIds: poll.selectedPlayerIds ?? [],
    computedWinnerOptionIds: poll.computedWinnerOptionIds ?? [],
    cutoffTieOptionIds: poll.cutoffTieOptionIds ?? [],
    cutoffSlotsRemaining: poll.cutoffSlotsRemaining ?? 0,
    options: poll.options.map((option) => ({
      id: option.id,
      position: option.position,
      label: option.label,
      mapId: option.map?.id ?? null,
      mapNameSnapshot: option.map?.name ?? null,
      mapSlugSnapshot: option.map?.slug ?? null,
      voteCount: option.voteCount,
      selectionSharePercent: option.selectionSharePercent,
      pollResultRank: option.pollResultRank,
      finalDecisionRank: option.finalDecisionRank,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function uuidOrUndefined(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value
    : undefined;
}

function nonNegativeInteger(value: string) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function logAdminPollLoadFailure(operation: string, error: unknown) {
  const candidateCode =
    isRecord(error) && typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  console.error("Polls & Decisions Admin load failed.", {
    operation,
    code: /^[A-Z0-9_]{3,32}$/.test(candidateCode)
      ? candidateCode
      : "POLL_LOAD_FAILED",
  });
}

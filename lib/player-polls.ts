import "server-only";

import {
  parsePollListProjection,
  type PollViewerProjection,
} from "@/lib/polls";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import { createNoStoreSupabaseClient } from "@/lib/supabase";

export type TournamentPollLoadResult = {
  pollsByTournament: Record<string, PollViewerProjection[]>;
  error: string | null;
};

export type CommunityPollLoadResult = {
  polls: PollViewerProjection[];
  error: string | null;
};

export async function loadTournamentPollsForRequest(
  tournamentIds: string[],
  authenticated: boolean
): Promise<TournamentPollLoadResult> {
  const pollsByTournament = Object.fromEntries(
    tournamentIds.map((tournamentId) => [tournamentId, []])
  ) as Record<string, PollViewerProjection[]>;

  if (tournamentIds.length === 0) {
    return { pollsByTournament, error: null };
  }

  try {
    const publicClient = createNoStoreSupabaseClient();
    let invalidProjection = false;
    let viewerClient: Awaited<
      ReturnType<typeof createAuthenticatedSupabaseClient>
    > | null = null;
    if (authenticated) {
      try {
        viewerClient = await createAuthenticatedSupabaseClient();
      } catch {
        invalidProjection = true;
      }
    }

    await Promise.all(
      tournamentIds.map(async (tournamentId) => {
        const [publicResult, viewerResult] = await Promise.all([
          runPollProjectionRequest(() =>
            publicClient.rpc("get_public_tournament_decisions", {
              p_tournament_id: tournamentId,
            })
          ),
          viewerClient
            ? runPollProjectionRequest(() =>
                viewerClient.rpc("get_my_tournament_polls", {
                  p_tournament_id: tournamentId,
                })
              )
            : Promise.resolve(
                authenticated ? null : { data: { polls: [] }, error: null }
              ),
        ]);
        const publicPolls = !publicResult || publicResult.error
          ? null
          : parsePollListProjection(publicResult.data, "public");
        const viewerPolls = !viewerResult || viewerResult.error
          ? null
          : parsePollListProjection(viewerResult.data, "viewer");
        if (!publicPolls || !viewerPolls) {
          invalidProjection = true;
        }

        pollsByTournament[tournamentId] = mergePublicAndViewerPolls(
          publicPolls?.polls ?? [],
          viewerPolls?.polls ?? []
        );
      })
    );

    if (invalidProjection) {
      console.error("Tournament Poll projection load failed.");
      return {
        pollsByTournament,
        error: "Some Tournament Decisions could not be loaded.",
      };
    }
    return { pollsByTournament, error: null };
  } catch {
    console.error("Tournament Poll projection load failed unexpectedly.");
    return {
      pollsByTournament,
      error: "Tournament Decisions could not be loaded.",
    };
  }
}

export async function loadCommunityPollsForRequest(): Promise<CommunityPollLoadResult> {
  try {
    const client = await createAuthenticatedSupabaseClient();
    const { data, error } = await client.rpc("get_my_community_polls");
    const parsed = error ? null : parsePollListProjection(data, "viewer");
    if (!parsed) {
      console.error("Community Poll projection load failed.");
      return { polls: [], error: "Community Polls could not be loaded." };
    }
    return { polls: parsed.polls, error: null };
  } catch {
    console.error("Community Poll projection load failed unexpectedly.");
    return { polls: [], error: "Community Polls could not be loaded." };
  }
}

async function runPollProjectionRequest(
  request: () => PromiseLike<{ data: unknown; error: unknown }>
) {
  try {
    return await request();
  } catch {
    return null;
  }
}

function mergePublicAndViewerPolls(
  publicPolls: PollViewerProjection[],
  viewerPolls: PollViewerProjection[]
) {
  const merged = new Map(publicPolls.map((poll) => [poll.id, poll]));
  for (const poll of viewerPolls) merged.set(poll.id, poll);
  return [...merged.values()];
}

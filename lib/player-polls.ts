import "server-only";

import { auth } from "@clerk/nextjs/server";
import { parsePollListProjection, type PollViewerProjection } from "@/lib/polls";
import { createPollDiagnostics } from "@/lib/poll-diagnostics";
import {
  isPollListSnapshotComplete,
  projectPollListSnapshot,
  type PollAccountState,
  type PollListPart,
  type PollListSnapshot,
  type PollSurface,
} from "@/lib/poll-loading";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createNoStoreSupabaseClient } from "@/lib/supabase";

export type TournamentPollLoadResult = {
  pollsByTournament: Record<string, PollViewerProjection[]>;
  snapshotsByTournament: Record<string, PollListSnapshot>;
  error: string | null;
};
export type CommunityPollLoadResult = {
  polls: PollViewerProjection[];
  snapshot: PollListSnapshot;
  error: string | null;
};

type Diagnostics = ReturnType<typeof createPollDiagnostics>;
type ViewerClient = Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>;
const LOOKUP_TIMEOUT_MS = 4_000;
const RPC_TIMEOUT_MS = 8_000;

export async function loadTournamentPollsForRequest(tournamentIds: string[]): Promise<TournamentPollLoadResult> {
  const snapshotsByTournament: Record<string, PollListSnapshot> = {};
  const pollsByTournament: Record<string, PollViewerProjection[]> = {};
  if (tournamentIds.length === 0) return { snapshotsByTournament, pollsByTournament, error: null };
  const diagnostics = createPollDiagnostics("tournament");
  const viewerPromise = resolveViewer(diagnostics);
  let publicClient: ReturnType<typeof createNoStoreSupabaseClient> | null = null;
  try { publicClient = createNoStoreSupabaseClient(); }
  catch { diagnostics("client", "public", "acquisition"); }

  // Bound concurrency independently of tournament count; each tournament keeps its own outcome.
  const ids = [...new Set(tournamentIds)];
  let offset = 0;
  await Promise.all(Array.from({ length: Math.min(ids.length, 4) }, async () => {
    while (offset < ids.length) {
      const tournamentId = ids[offset++];
      const [publicPart, privatePart] = await Promise.all([
        publicClient ? readPart(publicClient, "get_public_tournament_decisions", tournamentId, "public", "tournament", diagnostics) : unavailable(),
        viewerPromise.then((viewer) => viewer.client
          ? readPart(viewer.client, "get_my_tournament_polls", tournamentId, "private", "tournament", diagnostics)
          : viewer.part),
      ]);
      const viewer = await viewerPromise;
      const snapshot: PollListSnapshot = {
        surface: "tournament", tournamentId, public: publicPart, private: privatePart,
        accountState: viewer.accountState, viewerContext: viewer.context,
      };
      snapshotsByTournament[tournamentId] = snapshot;
      pollsByTournament[tournamentId] = projectPollListSnapshot(snapshot);
    }
  }));
  return {
    snapshotsByTournament, pollsByTournament,
    error: Object.values(snapshotsByTournament).every(isPollListSnapshotComplete) ? null : "Some Tournament Decisions could not be loaded.",
  };
}

export async function loadCommunityPollsForRequest(): Promise<CommunityPollLoadResult> {
  const diagnostics = createPollDiagnostics("community");
  const viewer = await resolveViewer(diagnostics);
  const snapshot: PollListSnapshot = {
    surface: "community", tournamentId: null, public: { status: "not_applicable" },
    private: viewer.client ? await readPart(viewer.client, "get_my_community_polls", null, "private", "community", diagnostics) : viewer.part,
    accountState: viewer.accountState, viewerContext: viewer.context,
  };
  return { snapshot, polls: projectPollListSnapshot(snapshot), error: isPollListSnapshotComplete(snapshot) ? null : "Community Polls could not be loaded." };
}

async function resolveViewer(diagnostics: Diagnostics): Promise<{
  context: PollListSnapshot["viewerContext"];
  accountState: PollAccountState;
  client: ViewerClient | null;
  part: PollListPart;
}> {
  let context: PollListSnapshot["viewerContext"] = { userId: null, sessionId: null };
  const failed = () => ({ context, accountState: "unavailable" as const, client: null, part: unavailable() });
  let session: Awaited<ReturnType<typeof auth>>;
  try { session = await withLookupDeadline(() => auth()); }
  catch { diagnostics("authentication", "request", "acquisition"); return failed(); }
  if (!session.userId) return { context, accountState: "anonymous", client: null, part: { status: "not_applicable" } };
  if (!session.sessionId) { diagnostics("authentication", "private", "validation"); return failed(); }
  context = { userId: session.userId, sessionId: session.sessionId };

  // Server-only, caller-derived, one-column lookup. No row creation and no member-query bypass.
  try {
    const result = await createSupabaseAdminClient().from("players")
      .select("account_closed_at").eq("clerk_user_id", session.userId)
      .abortSignal(AbortSignal.timeout(LOOKUP_TIMEOUT_MS)).maybeSingle();
    if (result.error) { diagnostics("player_lookup", "private", "rejection", result.error); return failed(); }
    if (result.data === null) return { context, accountState: "missing", client: null, part: { status: "not_applicable" } };
    const row: unknown = result.data;
    if (typeof row !== "object" || row === null || !("account_closed_at" in row) ||
      (row.account_closed_at !== null && (typeof row.account_closed_at !== "string" || !Number.isFinite(Date.parse(row.account_closed_at))))) {
      diagnostics("player_lookup", "private", "validation"); return failed();
    }
    if (row.account_closed_at !== null) return { context, accountState: "closed", client: null, part: { status: "not_applicable" } };
  } catch { diagnostics("player_lookup", "private", "transport"); return failed(); }

  let token: string | null;
  try { token = await withLookupDeadline(() => session.getToken()); }
  catch { diagnostics("token", "private", "acquisition"); return failed(); }
  if (!token) { diagnostics("token", "private", "acquisition"); return failed(); }
  try {
    const client = await createAuthenticatedSupabaseClient(async () => token);
    return { context, accountState: "active", client, part: unavailable() };
  } catch { diagnostics("client", "private", "acquisition"); return failed(); }
}

async function readPart(
  client: ViewerClient,
  rpc: "get_public_tournament_decisions" | "get_my_tournament_polls" | "get_my_community_polls",
  tournamentId: string | null,
  source: "public" | "private",
  surface: PollSurface,
  diagnostics: Diagnostics
): Promise<PollListPart> {
  let response: { data: unknown; error: unknown; status?: number };
  try {
    response = await client.rpc(rpc, tournamentId ? { p_tournament_id: tournamentId } : undefined)
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
  } catch { diagnostics("rpc", source, "transport"); return unavailable(); }
  if (response.error) {
    // postgrest-js marks caught fetch failures with HTTP status 0; do not inspect
    // or emit its potentially sensitive message/details/hint strings.
    diagnostics("rpc", source, response.status === 0 ? "transport" : "rejection", response.error);
    return unavailable();
  }
  try {
    const parsed = parsePollListProjection(response.data, source === "public" ? "public" : "viewer");
    if (!parsed || parsed.polls.some((poll) => poll.tournamentId !== tournamentId ||
      poll.purpose !== (surface === "tournament" ? "tournament_decision" : "community_feedback"))) {
      diagnostics("projection", source, "validation"); return unavailable();
    }
    return { status: "loaded", polls: parsed.polls };
  } catch { diagnostics("application", source, "unexpected"); return unavailable(); }
}

function unavailable(): PollListPart { return { status: "unavailable" }; }

async function withLookupDeadline<T>(load: () => Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      load(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Poll lookup deadline.")), LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

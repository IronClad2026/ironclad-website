import { loadCommunityPollsForRequest, loadTournamentPollsForRequest } from "@/lib/player-polls";
import { createPollDiagnostics } from "@/lib/poll-diagnostics";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Read-only. Identity and ownership are resolved on the server, never from query inputs.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const surface = query.get("surface");
  const tournamentId = query.get("tournamentId");
  if ((surface !== "tournament" && surface !== "community") ||
    query.getAll("surface").length !== 1 || query.getAll("tournamentId").length > 1 ||
    [...query.keys()].some((key) => key !== "surface" && key !== "tournamentId") ||
    (surface === "tournament" ? !tournamentId || !UUID.test(tournamentId) : tournamentId !== null)) {
    return Response.json({ error: "Invalid poll request." }, { status: 400, headers: HEADERS });
  }
  try {
    const snapshot = surface === "community"
      ? (await loadCommunityPollsForRequest()).snapshot
      : (await loadTournamentPollsForRequest([tournamentId!])).snapshotsByTournament[tournamentId!];
    return Response.json(snapshot, { headers: HEADERS });
  } catch {
    createPollDiagnostics(surface)("application", "request", "unexpected");
    return Response.json({ error: "Polls could not be loaded." }, { status: 503, headers: HEADERS });
  }
}

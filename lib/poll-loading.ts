import { parsePollClientListProjection, type PollViewerProjection } from "@/lib/polls";

export type PollSurface = "tournament" | "community";
export type PollListPart =
  | { status: "loaded"; polls: PollViewerProjection[] }
  // Retained data is client-local only; a failed wire response never supplies it.
  | { status: "unavailable"; polls?: PollViewerProjection[] }
  | { status: "not_applicable" };
export type PollAccountState = "anonymous" | "active" | "missing" | "closed" | "unavailable";
export type PollListSnapshot = {
  surface: PollSurface;
  tournamentId: string | null;
  public: PollListPart;
  private: PollListPart;
  accountState: PollAccountState;
  // The requesting session's own context, never a lookup/authorization input or log field.
  viewerContext: { userId: string | null; sessionId: string | null };
};

export function isPollListSnapshotComplete(snapshot: PollListSnapshot) {
  return snapshot.public.status !== "unavailable" && snapshot.private.status !== "unavailable";
}

export function projectPollListSnapshot(snapshot: PollListSnapshot): PollViewerProjection[] {
  const publicPolls = snapshot.public.status === "not_applicable" ? [] : snapshot.public.polls ?? [];
  const privatePolls = snapshot.private.status === "not_applicable" ? [] : snapshot.private.polls ?? [];
  // A newly published public final decision must supersede an older private open poll.
  const ordered = snapshot.private.status === "unavailable"
    ? [...privatePolls, ...publicPolls]
    : [...publicPolls, ...privatePolls];
  return [...new Map(ordered.map((poll) => [poll.id, poll])).values()];
}

export function mergePollListSnapshot(
  snapshot: PollListSnapshot,
  previous?: PollListSnapshot
): PollListSnapshot {
  const sameContext = previous && previous.surface === snapshot.surface &&
    previous.tournamentId === snapshot.tournamentId &&
    previous.viewerContext.userId === snapshot.viewerContext.userId &&
    previous.viewerContext.sessionId === snapshot.viewerContext.sessionId;
  const retain = (next: PollListPart, old?: PollListPart): PollListPart =>
    next.status === "unavailable" && old && old.status !== "not_applicable"
      ? { status: "unavailable", polls: old.polls ?? [] }
      : next;
  return sameContext
    ? { ...snapshot, public: retain(snapshot.public, previous.public), private: retain(snapshot.private, previous.private) }
    : snapshot;
}

export function parsePollListSnapshot(
  value: unknown,
  surface: PollSurface,
  tournamentId: string | null
): PollListSnapshot | null {
  if (!isRecord(value) || value.surface !== surface || value.tournamentId !== tournamentId ||
    !hasOnlyKeys(value, ["surface", "tournamentId", "public", "private", "accountState", "viewerContext"]) ||
    !isRecord(value.viewerContext) || !hasOnlyKeys(value.viewerContext, ["userId", "sessionId"])) return null;
  const { userId, sessionId } = value.viewerContext;
  if (!isContextValue(userId) || !isContextValue(sessionId) ||
    ((userId === null) !== (sessionId === null))) return null;
  const accountState = value.accountState;
  if (accountState !== "anonymous" && accountState !== "active" && accountState !== "missing" &&
    accountState !== "closed" && accountState !== "unavailable") return null;
  if ((accountState === "anonymous" && userId !== null) ||
    ((accountState === "active" || accountState === "missing" || accountState === "closed") && userId === null)) return null;
  const publicPart = parsePart(value.public, "public", surface, tournamentId);
  const privatePart = parsePart(value.private, "viewer", surface, tournamentId);
  if (!publicPart || !privatePart ||
    (surface === "community" ? publicPart.status !== "not_applicable" : publicPart.status === "not_applicable") ||
    (accountState === "active" && privatePart.status === "not_applicable") ||
    (accountState === "unavailable" && privatePart.status !== "unavailable") ||
    (["anonymous", "missing", "closed"].includes(accountState) && privatePart.status !== "not_applicable")) return null;
  return { surface, tournamentId, public: publicPart, private: privatePart, accountState, viewerContext: { userId, sessionId } };
}

function parsePart(value: unknown, scope: "public" | "viewer", surface: PollSurface, tournamentId: string | null): PollListPart | null {
  if (!isRecord(value)) return null;
  if ((value.status === "unavailable" || value.status === "not_applicable") && hasOnlyKeys(value, ["status"])) {
    return { status: value.status };
  }
  if (value.status !== "loaded" || !hasOnlyKeys(value, ["status", "polls"])) return null;
  const parsed = parsePollClientListProjection(value.polls, scope);
  if (!parsed || parsed.polls.some((poll) => poll.tournamentId !== tournamentId ||
    poll.purpose !== (surface === "tournament" ? "tournament_decision" : "community_feedback"))) return null;
  return { status: "loaded", polls: parsed.polls };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}
function isContextValue(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= 256);
}

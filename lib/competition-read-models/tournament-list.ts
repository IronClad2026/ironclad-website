import "server-only";

import { readCompetitionPage } from "@/lib/competition-read-models/read-page";

import {
  COMPETITION_READ_LIMITS,
  COMPETITION_SCHEMA_VERSION,
  CompetitionReadError,
  readCompetitionRows,
  type CompetitionReadClient,
} from "@/lib/competition-read-models/shared";
import {
  loadTournamentCompetitionViews,
  type TournamentCompetitionView,
} from "@/lib/competition-read-models/tournaments";

/** Same generic listing policy as getPublicTournamentNavigation: terminal
 * cancelled/voided events remain direct-reference history, not discovery items.
 * The current tournament schema has no draft status or separate publish switch.
 */
export const PUBLIC_TOURNAMENT_LIST_STATUSES = [
  "upcoming",
  "registration_open",
  "in_progress",
  "completed",
] as const;

export type PublicTournamentListStatus =
  (typeof PUBLIC_TOURNAMENT_LIST_STATUSES)[number];

export type TournamentCompetitionListView = {
  schemaVersion: typeof COMPETITION_SCHEMA_VERSION;
  data: TournamentCompetitionView[];
  pagination: {
    offset: number;
    limit: number;
    hasMore: boolean;
    nextOffset: number | null;
    truncated: boolean;
  };
};

/** Bounded, SELECT-only discovery followed by one existing read-model batch. */
export async function loadTournamentCompetitionList(
  client: CompetitionReadClient,
  options: {
    status?: PublicTournamentListStatus;
    limit?: number;
    offset?: number;
    now?: number;
  } = {},
): Promise<TournamentCompetitionListView> {
  const limit = options.limit ?? 5;
  const offset = options.offset ?? 0;
  const status = options.status;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > COMPETITION_READ_LIMITS.tournaments ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    (status !== undefined && !isPublicTournamentListStatus(status)) ||
    (options.now !== undefined && !Number.isFinite(options.now))
  ) {
    throw new CompetitionReadError("Invalid tournament list request.");
  }
  const statuses =
    status === undefined ? [...PUBLIC_TOURNAMENT_LIST_STATUSES] : [status];
  const result = await readCompetitionPage(
    client
      .from("tournaments")
      .select("id", { count: "exact" })
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit)
      .limit(limit + 1),
    offset,
    () =>
      client
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .in("status", statuses),
  );
  const candidates = await readCompetitionRows(
    Promise.resolve(result),
    limit + 1,
    parseId,
  );
  const count = result.count;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new CompetitionReadError("Tournament list count is invalid.");
  }
  if (candidates.length !== Math.min(limit + 1, Math.max(0, count - offset))) {
    throw new CompetitionReadError(
      "Tournament list response was truncated.",
      "LIMIT_EXCEEDED",
    );
  }
  if (new Set(candidates).size !== candidates.length) {
    throw new CompetitionReadError("Tournament list identity is invalid.");
  }
  const pageIds = candidates.slice(0, limit);
  const views = pageIds.length
    ? await loadTournamentCompetitionViews(client, pageIds, {
        now: options.now,
      })
    : [];
  const byId = new Map(views.map((view) => [view.id, view]));
  if (
    byId.size !== views.length ||
    views.some((view) => !pageIds.includes(view.id)) ||
    pageIds.some((id) => !byId.has(id))
  ) {
    throw new CompetitionReadError("Tournament list authority is incomplete.");
  }
  // A concurrent status change must not expose a terminal event in discovery.
  // Pagination still advances over scanned candidates, even when one is omitted.
  const data = pageIds
    .map((id) => byId.get(id)!)
    .filter(
      (view) =>
        isPublicTournamentListStatus(view.status) &&
        (status === undefined || view.status === status),
    );
  const hasMore = offset + pageIds.length < count;
  const nextOffset = offset + pageIds.length;
  const truncated = hasMore && nextOffset > 10000;
  return {
    schemaVersion: COMPETITION_SCHEMA_VERSION,
    data,
    pagination: {
      offset,
      limit,
      hasMore,
      nextOffset: hasMore && !truncated ? nextOffset : null,
      truncated,
    },
  };
}

export function isPublicTournamentListStatus(
  value: unknown,
): value is PublicTournamentListStatus {
  return (
    typeof value === "string" &&
    PUBLIC_TOURNAMENT_LIST_STATUSES.includes(
      value as PublicTournamentListStatus,
    )
  );
}

function parseId(value: unknown): string {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.id,
    )
  ) {
    throw new CompetitionReadError("Tournament list identity is invalid.");
  }
  return value.id;
}

export const TOURNAMENT_MEDIA_TYPES = [
  "full_tournament",
  "match_cast",
  "video",
  "other",
] as const;

export type TournamentMediaType = (typeof TOURNAMENT_MEDIA_TYPES)[number];

export const TOURNAMENT_MEDIA_LIMITS = {
  title: 160,
  url: 2048,
  description: 500,
} as const;

export type TournamentMediaDatabaseRow = {
  id: string;
  tournament_id: string;
  title: string;
  url: string;
  media_type: TournamentMediaType;
  description: string | null;
  match_id: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentMediaItem = {
  id: string;
  title: string;
  url: string;
  mediaType: TournamentMediaType;
  description: string | null;
};

export type TournamentMediaAdminItem = TournamentMediaItem & {
  tournamentId: string;
  matchId: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TournamentMediaDraftInput = {
  mediaId: string | null;
  tournamentId: string;
  title: string;
  url: string;
  mediaType: TournamentMediaType;
  description: string | null;
  matchId: string | null;
  published: boolean;
};

export type TournamentMediaInputResult =
  | { ok: true; value: TournamentMediaDraftInput }
  | { ok: false; message: string };

const tournamentMediaTypeSet = new Set<string>(TOURNAMENT_MEDIA_TYPES);
const forbiddenDescriptionControlPattern =
  /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const databaseRowKeys = [
  "id",
  "tournament_id",
  "title",
  "url",
  "media_type",
  "description",
  "match_id",
  "published",
  "created_at",
  "updated_at",
] as const;

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function normalizeTournamentMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TOURNAMENT_MEDIA_LIMITS.url) return null;

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return null;
    }

    const normalized = url.toString();
    return normalized.length <= TOURNAMENT_MEDIA_LIMITS.url
      ? normalized
      : null;
  } catch {
    return null;
  }
}

export function parseTournamentMediaDraftInput(
  value: unknown
): TournamentMediaInputResult {
  if (!isRecord(value)) {
    return { ok: false, message: "Enter valid Tournament media details." };
  }

  const mediaId = value.mediaId === null ? null : value.mediaId;
  const tournamentId = value.tournamentId;
  const title = normalizeRequiredText(value.title);
  const url = normalizeTournamentMediaUrl(value.url);
  const mediaType = value.mediaType;
  const description = normalizeOptionalText(value.description);
  const matchId = value.matchId === null ? null : value.matchId;

  if (mediaId !== null && !isUuid(mediaId)) {
    return { ok: false, message: "Select a valid media entry." };
  }
  if (!isUuid(tournamentId)) {
    return { ok: false, message: "Select a valid Tournament." };
  }
  if (!title) {
    return { ok: false, message: "Media title is required." };
  }
  if (title.length > TOURNAMENT_MEDIA_LIMITS.title) {
    return { ok: false, message: "Media title must be 160 characters or fewer." };
  }
  if (!url) {
    return { ok: false, message: "Enter a valid HTTPS media URL." };
  }
  if (!isTournamentMediaType(mediaType)) {
    return { ok: false, message: "Select a valid media type." };
  }
  if (description === undefined) {
    return { ok: false, message: "Media description must be 500 characters or fewer." };
  }
  if (matchId !== null && !isUuid(matchId)) {
    return { ok: false, message: "Select a valid Tournament Match." };
  }
  if (typeof value.published !== "boolean") {
    return { ok: false, message: "Select whether this media is published or hidden." };
  }

  return {
    ok: true,
    value: {
      mediaId,
      tournamentId,
      title,
      url,
      mediaType,
      description,
      matchId,
      published: value.published,
    },
  };
}

export function parseTournamentMediaDatabaseRow(
  value: unknown
): TournamentMediaDatabaseRow | null {
  if (!isRecord(value) || !hasOnlyKeys(value, databaseRowKeys)) return null;

  const title = normalizeRequiredText(value.title);
  const url = normalizeTournamentMediaUrl(value.url);
  const description = normalizeOptionalText(value.description);

  if (
    !isUuid(value.id) ||
    !isUuid(value.tournament_id) ||
    !title ||
    title.length > TOURNAMENT_MEDIA_LIMITS.title ||
    !url ||
    !isTournamentMediaType(value.media_type) ||
    description === undefined ||
    (value.match_id !== null && !isUuid(value.match_id)) ||
    typeof value.published !== "boolean" ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    id: value.id,
    tournament_id: value.tournament_id,
    title,
    url,
    media_type: value.media_type,
    description,
    match_id: value.match_id,
    published: value.published,
    created_at: new Date(value.created_at).toISOString(),
    updated_at: new Date(value.updated_at).toISOString(),
  };
}

export function mapTournamentMediaItem(
  row: TournamentMediaDatabaseRow
): TournamentMediaItem {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    mediaType: row.media_type,
    description: row.description,
  };
}

export function mapTournamentMediaAdminItem(
  row: TournamentMediaDatabaseRow
): TournamentMediaAdminItem {
  return {
    ...mapTournamentMediaItem(row),
    tournamentId: row.tournament_id,
    matchId: row.match_id,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sortTournamentMediaNewestFirst<
  T extends Pick<TournamentMediaAdminItem, "id" | "createdAt">,
>(items: readonly T[]): T[] {
  return [...items].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      right.id.localeCompare(left.id)
  );
}

function isTournamentMediaType(value: unknown): value is TournamentMediaType {
  return typeof value === "string" && tournamentMediaTypeSet.has(value);
}

function normalizeRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= TOURNAMENT_MEDIA_LIMITS.description &&
    !forbiddenDescriptionControlPattern.test(normalized)
    ? normalized
    : undefined;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
) {
  const allowed = new Set(keys);
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

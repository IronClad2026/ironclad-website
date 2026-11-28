import { isUuid, normalizeTournamentMediaUrl } from "@/lib/tournament-media";
import { parseCasterFeaturedVideo } from "./featured-video";
import { isCasterPublicSlug } from "./publication";

export const CASTER_COVERAGE_SCOPES = ["tournament", "division", "match"] as const;
export const CASTER_COVERAGE_STATUSES = ["scheduled", "completed", "cancelled", "unfulfilled"] as const;
export const CASTER_COVERAGE_CONFLICTS = ["none", "tournament", "division", "own_match"] as const;

export type CasterCoverageScope = typeof CASTER_COVERAGE_SCOPES[number];
export type CasterCoverageStatus = typeof CASTER_COVERAGE_STATUSES[number];
export type CasterCoverageConflict = typeof CASTER_COVERAGE_CONFLICTS[number];

export type CasterCoverageIdentity = {
  slug: string;
  display_name: string;
  publication_id: string;
  avatar: string;
};

export type CasterCoverageAssignment = {
  id: string;
  version: number;
  scope: CasterCoverageScope;
  status: CasterCoverageStatus;
  tournament_id: string;
  tournament_title: string;
  tournament_slug: string | null;
  tournament_available?: boolean;
  game: string;
  division_id: string | null;
  division_name: string | null;
  match_id: string | null;
  match_label: string | null;
  scheduled_at: string | null;
  covered_at: string | null;
  verified_at: string | null;
  broadcast_url: string | null;
  recording_url: string | null;
  media_id?: string | null;
  media_url?: string | null;
  media_title?: string | null;
  target_available: boolean;
  application_id?: string;
  conflict?: CasterCoverageConflict;
  caster?: CasterCoverageIdentity;
  former_caster?: true;
};

const twitchHosts = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const twitchNonChannels = new Set([
  "directory", "downloads", "jobs", "login", "p", "search", "settings", "signup", "subscriptions", "turbo", "videos",
]);

export function parseCasterCoverageRecordingUrl(value: unknown): string | null {
  if (!normalizeTournamentMediaUrl(value)) return null;
  return parseCasterFeaturedVideo(value)?.watchUrl ?? null;
}

export function parseCasterCoverageBroadcastUrl(value: unknown): string | null {
  const normalized = normalizeTournamentMediaUrl(value);
  if (!normalized) return null;
  const recording = parseCasterCoverageRecordingUrl(value);
  if (recording) return recording;

  const url = new URL(normalized);
  if (url.port) return null;
  if (twitchHosts.has(url.hostname)) {
    const channel = /^\/([A-Za-z0-9_]{1,25})\/?$/.exec(url.pathname)?.[1]?.toLowerCase();
    return channel && !twitchNonChannels.has(channel) ? `https://www.twitch.tv/${channel}` : null;
  }
  if (youtubeHosts.has(url.hostname)) {
    const route = /^\/(?:@[A-Za-z0-9_.-]{1,100}|channel\/UC[A-Za-z0-9_-]{22})(?:\/live)?\/?$/.exec(url.pathname)?.[0];
    return route ? `https://www.youtube.com${route.replace(/\/$/, "")}` : null;
  }
  return null;
}

function isCoverageValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.some((item) => item === value);
}

export function isCasterCoverageConflict(value: unknown): value is CasterCoverageConflict {
  return isCoverageValue(CASTER_COVERAGE_CONFLICTS, value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function publicCoverageDay(value: string | null): string | null {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function parseIdentity(value: unknown): CasterCoverageIdentity | undefined {
  const caster = record(value);
  if (!caster || !isCasterPublicSlug(caster.slug) || typeof caster.display_name !== "string" ||
      !isUuid(caster.avatar) || !isUuid(caster.publication_id)) return undefined;
  return { slug: caster.slug, display_name: caster.display_name, avatar: caster.avatar, publication_id: caster.publication_id };
}

export function parseCasterCoverageAssignment(value: unknown): CasterCoverageAssignment | null {
  const row = record(value);
  if (!row || !isUuid(row.id) || !isUuid(row.tournament_id) || typeof row.tournament_title !== "string" ||
      typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 0 || typeof row.game !== "string" ||
      !isCoverageValue(CASTER_COVERAGE_SCOPES, row.scope) || !isCoverageValue(CASTER_COVERAGE_STATUSES, row.status) ||
      typeof row.target_available !== "boolean") return null;
  const former = row.former_caster === true;
  const coveredAt = optionalDate(row.covered_at);
  const verifiedAt = optionalDate(row.verified_at);
  if (former && (row.status !== "completed" || !row.target_available || !coveredAt || !verifiedAt)) return null;
  const mediaUrl = former ? null : parseCasterCoverageBroadcastUrl(row.media_url);
  return {
    id: row.id,
    version: row.version,
    scope: row.scope,
    status: row.status,
    tournament_id: row.tournament_id,
    tournament_title: row.tournament_title,
    tournament_slug: optionalText(row.tournament_slug),
    tournament_available: typeof row.tournament_available === "boolean" ? row.tournament_available : undefined,
    game: row.game,
    division_id: isUuid(row.division_id) ? row.division_id : null,
    division_name: optionalText(row.division_name),
    match_id: isUuid(row.match_id) ? row.match_id : null,
    match_label: optionalText(row.match_label),
    scheduled_at: former ? null : optionalDate(row.scheduled_at),
    covered_at: former ? publicCoverageDay(coveredAt) : coveredAt,
    verified_at: former ? publicCoverageDay(verifiedAt) : verifiedAt,
    broadcast_url: former ? null : parseCasterCoverageBroadcastUrl(row.broadcast_url),
    recording_url: former ? null : parseCasterCoverageRecordingUrl(row.recording_url),
    media_id: !former && isUuid(row.media_id) ? row.media_id : null,
    media_url: mediaUrl,
    media_title: mediaUrl ? optionalText(row.media_title) : null,
    target_available: row.target_available,
    ...(former ? { former_caster: true as const } : {
      application_id: isUuid(row.application_id) ? row.application_id : undefined,
      conflict: isCasterCoverageConflict(row.conflict) ? row.conflict : undefined,
      caster: parseIdentity(row.caster),
    }),
  };
}

export function casterCoverageTournamentHref(row: CasterCoverageAssignment): string | null {
  if (!row.tournament_slug) return null;
  const params = new URLSearchParams({
    tournament: row.tournament_slug,
    tab: row.scope === "tournament" ? "media" : "brackets",
  });
  if (row.match_id && row.target_available) params.set("match", row.match_id);
  return `/tournaments?${params}`;
}

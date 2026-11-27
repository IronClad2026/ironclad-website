import { isUuid, TOURNAMENT_MEDIA_LIMITS } from "@/lib/tournament-media";
import { parseCasterFeaturedVideo } from "./featured-video";

export const CASTER_TOURNAMENT_VIDEO_PATH = "/api/caster/tournament-videos";

export type CasterTournamentVideo = {
  id: string;
  version: number;
  title: string;
  description: string | null;
  url: string;
  tournamentId: string;
  tournamentTitle: string;
  tournamentHref: string;
  divisionId: string | null;
  matchId: string | null;
  scopeLabel: string | null;
  published: boolean;
  publiclyVisible: boolean;
  publishedAt: string;
  moderationStatus: string;
  casterName: string | null;
};

export type CasterTournamentChoice = { id: string; title: string; slug: string };
export type CasterVideoDivision = { id: string; name: string };
export type CasterVideoMatch = { id: string; divisionId: string; label: string };
export type CasterTournamentContexts = { divisions: CasterVideoDivision[]; matches: CasterVideoMatch[] };

export function tournamentVideoHref(slug: string, id: string) {
  return `/tournaments?${new URLSearchParams({ tournament: slug, tab: "media" })}#tournament-media-${id}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseCasterTournamentVideo(value: unknown, publicRead = false): CasterTournamentVideo | null {
  const row = record(value);
  if (!row || !isUuid(row.id) || !isUuid(row.tournament_id) || typeof row.title !== "string" ||
      typeof row.tournament_title !== "string" || typeof row.tournament_slug !== "string" ||
      (!publicRead && !Number.isSafeInteger(row.version)) || typeof row.published !== "boolean") return null;
  const video = parseCasterFeaturedVideo(row.url);
  const date = row.published_at ?? row.created_at;
  if (!video || typeof date !== "string" || !Number.isFinite(Date.parse(date))) return null;
  const scopeLabel = [row.division_name, row.match_label].filter((label): label is string => typeof label === "string" && Boolean(label)).join(" · ");
  return {
    id: row.id, version: publicRead ? 0 : row.version as number, title: row.title, description: typeof row.description === "string" ? row.description : null,
    url: video.watchUrl, tournamentId: row.tournament_id, tournamentTitle: row.tournament_title,
    tournamentHref: tournamentVideoHref(row.tournament_slug, row.id), divisionId: isUuid(row.division_id) ? row.division_id : null,
    matchId: isUuid(row.match_id) ? row.match_id : null, scopeLabel: scopeLabel || null,
    published: row.published, publiclyVisible: typeof row.publicly_visible === "boolean" ? row.publicly_visible : row.published,
    publishedAt: date, moderationStatus: typeof row.moderation_status === "string" ? row.moderation_status : "visible",
    casterName: typeof row.caster_display_name === "string" ? row.caster_display_name : null,
  };
}

export function parseCasterTournamentVideos(value: unknown, publicRead = false): CasterTournamentVideo[] {
  return Array.isArray(value) ? value.flatMap((item) => parseCasterTournamentVideo(item, publicRead) ?? []) : [];
}

export function parseCasterTournamentChoices(value: unknown): CasterTournamentChoice[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const row = record(item);
    return row && isUuid(row.id) && typeof row.title === "string" && typeof row.slug === "string"
      ? [{ id: row.id, title: row.title, slug: row.slug }] : [];
  }) : [];
}

export function parseCasterTournamentContexts(value: unknown): CasterTournamentContexts | null {
  const row = record(value);
  if (!row || !Array.isArray(row.divisions) || !Array.isArray(row.matches)) return null;
  return {
    divisions: row.divisions.flatMap((item) => {
      const entry = record(item);
      return entry && isUuid(entry.id) && typeof entry.name === "string" ? [{ id: entry.id, name: entry.name }] : [];
    }),
    matches: row.matches.flatMap((item) => {
      const entry = record(item);
      return entry && isUuid(entry.id) && isUuid(entry.division_id) && typeof entry.label === "string"
        ? [{ id: entry.id, divisionId: entry.division_id, label: entry.label }] : [];
    }),
  };
}

type VideoSave = {
  action: "save"; mediaId: string | null; version: number | null; tournamentId: string;
  divisionId: string | null; matchId: string | null; title: string; description: string | null; url: string;
};
type VideoAction = VideoSave | { action: "contexts"; tournamentId: string }
  | { action: "unpublish"; mediaId: string; version: number };

export function parseCasterTournamentVideoAction(value: unknown): VideoAction | null {
  const row = record(value);
  if (!row) return null;
  if (row.action === "contexts") return isUuid(row.tournamentId) ? { action: row.action, tournamentId: row.tournamentId } : null;
  const version = typeof row.version === "number" && Number.isInteger(row.version) && row.version > 0 && row.version < 2_147_483_647
    ? row.version : null;
  const mediaId = isUuid(row.mediaId) ? row.mediaId : null;
  if (row.action === "unpublish") return mediaId && version ? { action: row.action, mediaId, version } : null;
  if (row.action !== "save" || !isUuid(row.tournamentId) || (row.mediaId != null && !mediaId) ||
      (mediaId !== null && version === null) || (mediaId === null && row.version != null) ||
      (row.divisionId != null && !isUuid(row.divisionId)) || (row.matchId != null && (!isUuid(row.matchId) || !isUuid(row.divisionId)))) return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const video = parseCasterFeaturedVideo(row.url);
  if (!title || title.length > TOURNAMENT_MEDIA_LIMITS.title || /[\u0000-\u001f\u007f]/.test(title) ||
      description.length > TOURNAMENT_MEDIA_LIMITS.description || /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(description) || !video) return null;
  return {
    action: "save", mediaId, version, tournamentId: row.tournamentId, divisionId: isUuid(row.divisionId) ? row.divisionId : null,
    matchId: isUuid(row.matchId) ? row.matchId : null, title, description: description || null, url: video.watchUrl,
  };
}

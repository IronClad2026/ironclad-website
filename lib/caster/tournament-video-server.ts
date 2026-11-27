import "server-only";

import { isUuid, parseTournamentMediaDatabaseRow, type TournamentMediaDatabaseRow } from "@/lib/tournament-media";
import { isCasterProgramEnabled } from "./environment";
import { isCasterPublicSlug } from "./publication";
import { casterRpc, loadCurrentCasterAccount } from "./server";
import { parseCasterTournamentChoices, parseCasterTournamentVideos } from "./tournament-video";
import { casterPublicProfilePath } from "./publication";

type OwnerResult = { status: string; media?: unknown; tournaments?: unknown; published_count?: unknown; covered_tournament_ids?: unknown };

export async function loadCasterVideoWorkspace(actor: string) {
  if (!isCasterProgramEnabled()) return null;
  const account = await loadCurrentCasterAccount();
  if (account.status !== "open" || !account.emailVerified || account.id !== actor) return null;
  const [result, profile] = await Promise.all([
    casterRpc<OwnerResult>("caster_media_owner", { p_actor: actor }),
    casterRpc<{ status: string; profile?: { publication_id?: string | null; hidden?: boolean; membership_status?: string } }>("caster_phase3_owner", { p_actor: actor }),
  ]);
  return result?.status === "ok" ? {
    media: parseCasterTournamentVideos(result.media), tournaments: parseCasterTournamentChoices(result.tournaments),
    publishedCount: typeof result.published_count === "number" && Number.isInteger(result.published_count) ? result.published_count : null,
    coveredTournamentIds: Array.isArray(result.covered_tournament_ids) ? result.covered_tournament_ids.filter(isUuid) : null,
    canPublish: profile?.status === "ok" && Boolean(profile.profile?.publication_id) && profile.profile?.hidden === false && profile.profile.membership_status === "active",
  } : null;
}

export async function loadPublicCasterTournamentVideos(slug: string) {
  if (!isCasterProgramEnabled() || !isCasterPublicSlug(slug)) return [];
  const result = await casterRpc<unknown>("caster_media_public_profile", { p_slug: slug });
  return parseCasterTournamentVideos(result, true).filter((video) => video.published);
}

type CombinedMediaRow = TournamentMediaDatabaseRow & { casterName?: string; casterProfileHref?: string; casterScopeLabel?: string };

export async function loadCombinedTournamentMedia(tournamentIds: string[]): Promise<CombinedMediaRow[] | null> {
  if (!isCasterProgramEnabled()) return null;
  const ids = [...new Set(tournamentIds.filter(isUuid))];
  const rows: CombinedMediaRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const allowed = new Set(batch);
    const data = await casterRpc<unknown>("caster_media_public_tournaments", { p_tournament_ids: batch, p_include_casters: true });
    if (!Array.isArray(data)) return null;
    for (const row of data) {
      if (!row || typeof row !== "object") return null;
      const { id, tournament_id, title, url, media_type, description, match_id, published, created_at, updated_at } = row;
      const parsed = parseTournamentMediaDatabaseRow({ id, tournament_id, title, url, media_type, description, match_id, published, created_at, updated_at });
      if (!parsed || !allowed.has(parsed.tournament_id) || !parsed.published) return null;
      const scope = [row.division_name, row.match_label].filter((value): value is string => typeof value === "string" && Boolean(value)).join(" · ");
      rows.push(isCasterPublicSlug(row.caster_slug) && typeof row.caster_display_name === "string"
        ? { ...parsed, casterName: row.caster_display_name, casterProfileHref: casterPublicProfilePath(row.caster_slug), ...(scope && { casterScopeLabel: scope }) } : parsed);
    }
  }
  return rows;
}

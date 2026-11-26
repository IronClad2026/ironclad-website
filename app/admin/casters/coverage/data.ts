import "server-only";

import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { parseCasterCoverageAssignment, parseCasterCoverageRecordingUrl } from "@/lib/caster/coverage";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterRpc } from "@/lib/caster/server";
import { requireDivisionModelVersion } from "@/lib/division-model";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getTournamentBracketDisplayName } from "@/lib/tournaments";
import { isCasterApplicationId } from "../admin-application-contracts";
import type { CasterModerationList } from "../moderation-contracts";
import type { AdminCoverageAssignment, CoverageChoices, CoverageConflict, CoverageList, CoverageOption, CoverageSearchResult } from "./contracts";

export async function currentCastingAdmin() {
  if (!isCasterProgramEnabled()) return null;
  try {
    const actor = await requireCurrentPatch2Admin();
    await requireCurrentAccountLegalAcceptance();
    return actor;
  } catch {
    return null;
  }
}

export async function loadCastingAssignments(actor: string, tournament: string | null, page: number): Promise<CoverageList | null> {
  const result = await casterRpc<{ status: string; assignments?: unknown[]; has_more?: boolean }>("caster_phase4_admin_list", {
    p_actor: actor, p_tournament_id: tournament, p_application_id: null, p_offset: (page - 1) * 25,
  });
  if (result?.status !== "ok" || !Array.isArray(result.assignments)) return null;
  const assignments = result.assignments.map(parseAdminAssignment);
  if (assignments.some((assignment) => assignment === null)) return null;
  return { assignments: assignments as AdminCoverageAssignment[], hasMore: result.has_more === true };
}

export function parseAdminAssignment(value: unknown): AdminCoverageAssignment | null {
  const row = parseCasterCoverageAssignment(value);
  if (!row || !value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (!isCasterApplicationId(source.application_id) || !Number.isInteger(source.version)) return null;
  return {
    ...row,
    application_id: source.application_id,
    caster_display_name: typeof source.caster_display_name === "string" ? source.caster_display_name : null,
    own_match_reason: typeof source.own_match_reason === "string" ? source.own_match_reason : null,
    verified_by: typeof source.verified_by === "string" ? source.verified_by : null,
    conflict: isCoverageConflict(source.conflict) ? source.conflict : undefined,
  };
}

export function isCoverageConflict(value: unknown): value is CoverageConflict {
  return value === "none" || value === "tournament" || value === "division" || value === "own_match";
}

export async function loadCastingCasters(actor: string, query: string, page: number): Promise<CoverageSearchResult> {
  const result = await casterRpc<CasterModerationList>("caster_phase3_admin_list", {
    p_actor: actor, p_status: "active", p_query: query || null, p_offset: (page - 1) * 25,
  });
  if (result?.status !== "ok") return { kind: "error", message: "Approved casters could not be loaded." };
  return {
    kind: "ok",
    query,
    page,
    hasMore: result.has_more,
    casters: result.casters
      .filter((caster) => !caster.closed && caster.membership_status === "active")
      .map((caster) => ({ id: caster.application_id, label: caster.display_name || caster.owner_clerk_user_id, slug: caster.slug })),
  };
}

export async function loadCastingTournaments(query: string, page: number): Promise<{ tournaments: CoverageOption[]; hasMore: boolean } | null> {
  try {
    const offset = (page - 1) * 25;
    let request = createSupabaseAdminClient().from("tournaments").select("id,title")
      .order("created_at", { ascending: false }).order("id").range(offset, offset + 25);
    if (query) request = request.ilike("title", `%${query.replace(/[\\%_*]/g, "\\$&")}%`);
    const result = await request.abortSignal(AbortSignal.timeout(5000));
    if (result.error) return null;
    return { tournaments: result.data.slice(0, 25).map((row) => ({ id: row.id, label: row.title })), hasMore: result.data.length > 25 };
  } catch {
    return null;
  }
}

export async function loadCastingChoices(tournament: string): Promise<CoverageChoices | null> {
  try {
    const client = createSupabaseAdminClient();
    const [event, divisions, media] = await Promise.all([
      client.from("tournaments").select("division_model_version").eq("id", tournament).abortSignal(AbortSignal.timeout(5000)).maybeSingle(),
      client.from("tournament_brackets").select("id,name").eq("tournament_id", tournament).order("created_at").abortSignal(AbortSignal.timeout(5000)),
      client.from("tournament_media").select("id,title,match_id,media_type,url").eq("tournament_id", tournament)
        .eq("published", true).order("created_at", { ascending: false }).order("id").limit(501).abortSignal(AbortSignal.timeout(5000)),
    ]);
    if (event.error || !event.data || divisions.error || media.error) return null;
    const model = requireDivisionModelVersion(event.data.division_model_version);
    const options: CoverageChoices = {
      divisions: divisions.data.map((row) => ({ id: row.id, label: getTournamentBracketDisplayName(row.name, model) })),
      matches: [],
      media: media.data.slice(0, 500).flatMap((row) =>
        (row.match_id || row.media_type !== "match_cast") && parseCasterCoverageRecordingUrl(row.url)
          ? [{ id: row.id, label: row.title, match: row.match_id }] : []),
      matchLimitReached: false,
      mediaLimitReached: media.data.length > 500,
    };
    if (!options.divisions.length) return options;

    const generated = await client.from("generated_brackets").select("id,tournament_bracket_id")
      .in("tournament_bracket_id", options.divisions.map(({ id }) => id)).abortSignal(AbortSignal.timeout(5000));
    if (generated.error) return null;
    if (!generated.data.length) return options;

    const map = new Map(generated.data.map((row) => [row.id, row.tournament_bracket_id]));
    // Read every current match of this scoped tournament in pages so later rounds
    // remain selectable without passing the database gateway's row-size limit.
    const pageSize = 500;
    for (let from = 0; from < 10_000; from += pageSize) {
      const matches = await client.from("tournament_matches")
        .select("id,generated_bracket_id,match_number,bracket_rounds(name,round_number)")
        .in("generated_bracket_id", [...map.keys()]).order("id").range(from, from + pageSize - 1)
        .abortSignal(AbortSignal.timeout(5000));
      if (matches.error) return null;
      for (const row of matches.data) {
        const division = map.get(row.generated_bracket_id);
        if (!division) continue;
        const round = Array.isArray(row.bracket_rounds) ? row.bracket_rounds[0] : row.bracket_rounds;
        const label = round?.name ? `${round.name} · Match ${row.match_number}` : `Match ${row.match_number}`;
        options.matches.push({ id: row.id, division, label });
      }
      if (matches.data.length < pageSize) break;
      if (from + pageSize === 10_000) options.matchLimitReached = true;
    }
    const natural = new Intl.Collator("en", { numeric: true });
    options.matches.sort((a, b) => natural.compare(a.label, b.label) || a.id.localeCompare(b.id));
    return options;
  } catch {
    return null;
  }
}

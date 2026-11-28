import "server-only";

import { auth } from "@clerk/nextjs/server";
import { isUuid } from "@/lib/tournament-media";
import { isCasterProgramEnabled } from "./environment";
import { parseCasterCoverageAssignment, type CasterCoverageAssignment } from "./coverage";
import { isCasterPublicSlug } from "./publication";
import { casterRpc } from "./server";

function list(value: unknown): CasterCoverageAssignment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = parseCasterCoverageAssignment(entry);
    return row ? [row] : [];
  });
}

export async function loadPublicCasterSchedules(tournaments: string[]): Promise<CasterCoverageAssignment[]> {
  if (!isCasterProgramEnabled()) return [];
  const distinct = [...new Set(tournaments.filter(isUuid))];
  if (distinct.length === 0) return [];
  const rows: CasterCoverageAssignment[] = [];
  for (let start = 0; start < distinct.length; start += 50) {
    const ids = distinct.slice(start, start + 50);
    const allowed = new Set(ids);
    const result = await casterRpc<unknown>("caster_privacy_public_verified_tournaments", { p_tournament_ids: ids })
      ?? await casterRpc<unknown>("caster_media_public_verified_tournaments", { p_tournament_ids: ids })
      ?? await casterRpc<unknown>("caster_phase4_public_schedules", { p_tournament_ids: ids });
    rows.push(...list(result).flatMap((row) => {
      if (!allowed.has(row.tournament_id) || (!row.caster && !row.former_caster) || !row.target_available ||
          row.status !== "completed") return [];
      delete row.application_id;
      delete row.conflict;
      return [row];
    }));
  }
  return rows;
}

export async function loadPublicCasterHistory(slug: string): Promise<CasterCoverageAssignment[]> {
  if (!isCasterProgramEnabled() || !isCasterPublicSlug(slug)) return [];
  const result = await casterRpc<unknown>("caster_phase4_public_history", { p_slug: slug });
  return list(result).flatMap((row) => {
    if (row.former_caster || row.status !== "completed" || !row.covered_at || !row.verified_at) return [];
    delete row.application_id;
    delete row.conflict;
    delete row.caster;
    return [row];
  });
}

export async function loadCasterAssignments(actor: string): Promise<CasterCoverageAssignment[] | null> {
  if (!isCasterProgramEnabled() || !/^user_[A-Za-z0-9_]{1,150}$/.test(actor)) return [];
  try {
    const { userId, sessionId } = await auth();
    if (userId !== actor || !sessionId) return [];
    type OwnerCoverage = { status?: unknown; assignments?: unknown };
    const result = await casterRpc<OwnerCoverage>("caster_media_owner_verified_history", { p_actor: actor })
      ?? await casterRpc<OwnerCoverage>("caster_phase4_owner", { p_actor: actor });
    if (result?.status === "ok") return list(result.assignments).filter((row) => row.status === "completed" && row.verified_at && row.covered_at);
    return result?.status === "not_found" || result?.status === "closed" ? [] : null;
  } catch {
    return null;
  }
}

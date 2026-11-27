import "server-only";

import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type LegacyAssistanceRequest = {
  id: string;
  tournament_id: string | null;
  source_notification_id: string | null;
  status: "open" | "in_progress" | "resolved";
  version: number;
  legacy_resolution_unknown: boolean;
  created_at: string;
  updated_at: string;
  title: string | null;
  message: string | null;
  actor_display_name: string | null;
  match_id: string | null;
};

export async function requireLegacyAssistanceAdmin() {
  return requireCurrentPatch2Admin();
}

export function parseLegacyAssistanceScope(kind: unknown, tournament: unknown): string | null {
  if (kind === "unassigned" && (tournament === undefined || tournament === null || tournament === "")) return null;
  if (kind === "tournament" && typeof tournament === "string" && isUuid(tournament)) return tournament.toLowerCase();
  throw new Error("Open the assistance queue for a selected tournament or unassigned legacy records.");
}

export async function loadLegacyAssistanceQueue(tournamentId: string | null, page = 1, includeResolved = false) {
  const actorClerkUserId = await requireLegacyAssistanceAdmin();
  if ((tournamentId !== null && !isUuid(tournamentId)) || !Number.isSafeInteger(page) || page < 1 || page > 2147483647) {
    throw new Error("Invalid assistance context.");
  }
  const canonicalTournamentId = tournamentId?.toLowerCase() ?? null;
  const { data, error } = await createSupabaseAdminClient().rpc("read_legacy_assistance_queue_as_admin", {
    p_actor_clerk_user_id: actorClerkUserId,
    p_tournament_id: canonicalTournamentId, p_page: page, p_include_resolved: includeResolved,
  });
  if (error || !data || !Array.isArray(data.requests) || !Number.isSafeInteger(data.totalCount) || data.totalCount < 0 ||
    data.pageCount !== Math.max(1, Math.ceil(data.totalCount / 25)) || data.page !== Math.min(page, data.pageCount) ||
    data.requests.length !== Math.min(25, data.totalCount - (data.page - 1) * 25) ||
    data.requests.some((row: LegacyAssistanceRequest) => !row || !isUuid(row.id) || row.tournament_id !== canonicalTournamentId ||
      !["open", "in_progress", "resolved"].includes(row.status) || !Number.isSafeInteger(row.version) || row.version < 1 || (!includeResolved && row.status === "resolved"))) {
    throw new Error("Legacy assistance could not be loaded. Refresh and try again.");
  }
  return data as { requests: LegacyAssistanceRequest[]; totalCount: number; page: number; pageCount: number };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

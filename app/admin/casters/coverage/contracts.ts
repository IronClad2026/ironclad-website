import type { CasterCoverageAssignment } from "@/lib/caster/coverage";
import type { CasterAdminResult } from "../admin-application-contracts";

export const CASTER_COVERAGE_ADMIN_PATH = "/admin/casters/coverage";
export const MAX_CASTERS_PER_ASSIGNMENT = 10;

export const coverageStatusLabels = {
  scheduled: "Scheduled",
  completed: "Completed · verified",
  cancelled: "Cancelled",
  unfulfilled: "Unfulfilled",
} as const;

export const coverageScopeLabels = {
  tournament: "Tournament",
  division: "Division",
  match: "Match",
} as const;

export const coverageActionLabels = {
  update: "Save schedule and links",
  complete: "Confirm completed coverage",
  cancel: "Cancel assignment",
  unfulfilled: "Record as unfulfilled",
  correct: "Correct verified coverage",
} as const;

export type CoverageMutation = keyof typeof coverageActionLabels;
export type CoverageConflict = "none" | "tournament" | "division" | "own_match";
export type CoverageScope = keyof typeof coverageScopeLabels;
export type CoverageTarget = { tournament: string; division: string | null; match: string | null };
export type CoverageOption = { id: string; label: string };
export type CoverageChoices = {
  divisions: CoverageOption[];
  matches: (CoverageOption & { division: string })[];
  media: (CoverageOption & { match: string | null })[];
  matchLimitReached: boolean;
  mediaLimitReached: boolean;
};
export type CoverageCasterOption = CoverageOption & { slug: string | null };
export type AdminCoverageAssignment = CasterCoverageAssignment & {
  application_id: string;
  caster_display_name: string | null;
  own_match_reason: string | null;
  verified_by: string | null;
  conflict?: CoverageConflict;
};
export type CoverageList = { assignments: AdminCoverageAssignment[]; hasMore: boolean };
export type CoverageSearchResult = CasterAdminResult & {
  casters?: CoverageCasterOption[];
  query?: string;
  page?: number;
  hasMore?: boolean;
};
export type CoverageConflictResult = CasterAdminResult & {
  key?: string;
  conflicts?: { caster: string; level: CoverageConflict }[];
};
export type CoverageAuditEvent = {
  id: number | string;
  action: "create" | CoverageMutation;
  actor: string;
  created_at: string;
  reason: string | null;
  previous: Record<string, unknown> | null;
  current: Record<string, unknown> | null;
};
export type CoverageHistoryResult = CasterAdminResult & { events?: CoverageAuditEvent[] };
export type CoverageMutationResult = CasterAdminResult & { code?: "own_match_ack_required" };

export function coverageWorkspaceHref(tournament: string, page = 1) {
  const query = new URLSearchParams({ section: "casting" });
  if (page > 1) query.set("page", String(page));
  return `/admin/tournaments/${encodeURIComponent(tournament)}?${query}`;
}

export function coverageSelectionKey(target: CoverageTarget, casters: string[]) {
  return JSON.stringify([target.tournament, target.division, target.match, [...casters].sort()]);
}

export const conflictWarnings: Record<Exclude<CoverageConflict, "none">, string> = {
  tournament: "Also registered as a competitor in this tournament.",
  division: "Also registered as a competitor in this division.",
  own_match: "A participant in this match. Assign another caster unless an operational exception is necessary.",
};

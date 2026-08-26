import "server-only";

import { auth } from "@clerk/nextjs/server";
import {
  buildAdminRegistrationEvidence,
  buildRegistrationOrderMap,
  buildWaitlistPositionMap,
  type AdminRegistrationOrderInput,
  type AdminRegistrationReviewRow,
  type AdminRegistrationStatus,
  type AdminWaitlistOfferStatus,
} from "@/lib/admin-registration-review";
import type { AdminTournamentWorkspaceRow } from "@/lib/admin-tournament-workspace";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  PHASE_FOUR_ACTIVE_COHORT_SIZE,
  isActiveReviewCohortStatus,
} from "@/lib/tournament-registration-cohort";
import { getTournamentBracketDisplayName } from "@/lib/tournaments";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type AdminTournamentRegistrationFilter =
  | "all"
  | AdminRegistrationStatus;

export type AdminTournamentRegistrationSection =
  | "registrations"
  | "players-waitlist";

type SupabaseRegistration = {
  id: string;
  player_name: string;
  country: string | null;
  submitted_elo: number | null;
  elo_verified_elo: number | null;
  elo_highest_faction: string | null;
  elo_checked_at: string | null;
  elo_verification_source: string | null;
  elo_verified_division: string | null;
  elo_calculation_version: string | null;
  registration_status: AdminRegistrationStatus;
  admin_notes: string | null;
  created_at: string;
  tournament_id: string | null;
  tournament_bracket_id: string | null;
  tournament_title: string | null;
  bracket_name: string | null;
  waitlist_offer_status: AdminWaitlistOfferStatus | null;
};

export type AdminTournamentRegistrationCohortSummary = {
  bracketId: string;
  bracketName: string;
  activeCohortCount: number;
  approvedCount: number;
  requiredCount: number;
  waitlistCount: number;
  isReady: boolean;
  launchedAt: string | null;
};

export type AdminTournamentRegistrationWorkspaceData = {
  rows: AdminRegistrationReviewRow[];
  allRows: AdminRegistrationReviewRow[];
  selectedRegistration: AdminRegistrationReviewRow | null;
  selectedRegistrationIsTerminal: boolean;
  activeFilter: AdminTournamentRegistrationFilter;
  counts: Record<AdminTournamentRegistrationStatusKey, number>;
  cohortSummaries: AdminTournamentRegistrationCohortSummary[];
  waitlistNotices: Array<{
    id: string;
    playerName: string;
    bracketName: string;
    waitlistPosition: number | null;
    offerStatus: AdminWaitlistOfferStatus | null;
  }>;
  hasBulkApprovableRegistration: boolean;
};

export type AdminTournamentRegistrationStatusKey =
  | "all"
  | AdminRegistrationStatus;

const ALL_FILTERS: readonly AdminTournamentRegistrationFilter[] = [
  "all",
  "pending",
  "manual_review",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
];

export function getSafeAdminTournamentRegistrationFilter(
  filter: string | undefined,
  section: AdminTournamentRegistrationSection
): AdminTournamentRegistrationFilter {
  const candidate = ALL_FILTERS.includes(
    filter as AdminTournamentRegistrationFilter
  )
    ? (filter as AdminTournamentRegistrationFilter)
    : "all";

  if (
    section === "players-waitlist" &&
    candidate !== "all" &&
    candidate !== "approved" &&
    candidate !== "waitlisted"
  ) {
    return "all";
  }

  if (
    section === "registrations" &&
    candidate === "waitlisted"
  ) {
    return "all";
  }

  return candidate;
}

export async function loadAdminTournamentRegistrationWorkspace(
  tournament: AdminTournamentWorkspaceRow,
  {
    filter,
    section,
    selectedRegistrationId,
  }: {
    filter?: string;
    section: AdminTournamentRegistrationSection;
    selectedRegistrationId?: string;
  }
): Promise<AdminTournamentRegistrationWorkspaceData> {
  await requireAdmin();
  const activeFilter = getSafeAdminTournamentRegistrationFilter(
    filter,
    section
  );
  const supabase = createSupabaseAdminClient();
  const registrationResult = await supabase
    .from("registrations")
    .select(
      "id, player_name, country, submitted_elo, elo_verified_elo, elo_highest_faction, elo_checked_at, elo_verification_source, elo_verified_division, elo_calculation_version, registration_status, admin_notes, created_at, tournament_id, tournament_bracket_id, tournament_title, bracket_name, waitlist_offer_status"
    )
    .eq("tournament_id", tournament.id)
    .order("created_at", { ascending: true });

  if (registrationResult.error || !Array.isArray(registrationResult.data)) {
    console.error("Admin Tournament registration workspace load failed.", {
      operation: "load-tournament-registrations",
    });
    throw new Error("Tournament registrations could not be loaded.");
  }

  const registrations = registrationResult.data as SupabaseRegistration[];
  const brackets = tournament.tournament_brackets ?? [];
  const bracketMetaById = new Map(
    brackets.map((bracket) => [
      bracket.id,
      {
        name: getTournamentBracketDisplayName(bracket.name),
        launchedAt: bracket.launched_at,
      },
    ])
  );
  const isBracketWaitlistOpen = (bracketId: string | null) =>
    bracketId !== null &&
    bracketMetaById.get(bracketId)?.launchedAt === null &&
    tournament.status !== "cancelled" &&
    tournament.status !== "voided";
  const orderInputs: AdminRegistrationOrderInput[] = registrations.map(
    (registration) => ({
      registrationId: registration.id,
      tournamentId: registration.tournament_id,
      tournamentBracketId: registration.tournament_bracket_id,
      createdAt: registration.created_at,
      status: registration.registration_status,
      waitlistOfferStatus: registration.waitlist_offer_status,
    })
  );
  const registrationOrderById = buildRegistrationOrderMap(orderInputs);
  const waitlistPositionById = buildWaitlistPositionMap(
    orderInputs.filter(({ tournamentBracketId }) =>
      isBracketWaitlistOpen(tournamentBracketId)
    )
  );
  const activeCohortCountByBracket = new Map<string, number>();
  const approvedCountByBracket = new Map<string, number>();
  const waitlistCountByBracket = new Map<string, number>();

  for (const registration of registrations) {
    const bracketId = registration.tournament_bracket_id;
    if (!bracketId) continue;

    if (isActiveReviewCohortStatus(registration.registration_status)) {
      activeCohortCountByBracket.set(
        bracketId,
        (activeCohortCountByBracket.get(bracketId) ?? 0) + 1
      );
      if (registration.registration_status === "approved") {
        approvedCountByBracket.set(
          bracketId,
          (approvedCountByBracket.get(bracketId) ?? 0) + 1
        );
      }
    } else if (
      registration.registration_status === "waitlisted" &&
      registration.waitlist_offer_status === null &&
      isBracketWaitlistOpen(bracketId)
    ) {
      waitlistCountByBracket.set(
        bracketId,
        (waitlistCountByBracket.get(bracketId) ?? 0) + 1
      );
    }
  }

  const readinessResults = await Promise.all(
    brackets.map(async (bracket) => {
      const { data, error } = await supabase.rpc(
        "get_tournament_bracket_readiness",
        { p_tournament_bracket_id: bracket.id }
      );

      if (error) {
        console.error("Admin registration readiness load failed.", {
          operation: "load-tournament-registration-readiness",
        });
        return null;
      }

      const readiness = Array.isArray(data) ? data[0] : data;
      return readiness
        ? {
            bracketId: bracket.id,
            approvedCount: Number(readiness.approved_count),
            requiredCount: Number(readiness.required_count),
            isReady: readiness.is_ready === true,
            launchedAt:
              typeof readiness.launched_at === "string"
                ? readiness.launched_at
                : bracket.launched_at,
          }
        : null;
    })
  );
  const readinessByBracket = new Map(
    readinessResults
      .filter((readiness) => readiness !== null)
      .map((readiness) => [readiness.bracketId, readiness])
  );
  const cohortSummaries = brackets.map((bracket) => {
    const readiness = readinessByBracket.get(bracket.id);
    return {
      bracketId: bracket.id,
      bracketName: getTournamentBracketDisplayName(bracket.name),
      activeCohortCount: activeCohortCountByBracket.get(bracket.id) ?? 0,
      approvedCount:
        readiness?.approvedCount ?? approvedCountByBracket.get(bracket.id) ?? 0,
      requiredCount:
        readiness?.requiredCount ?? PHASE_FOUR_ACTIVE_COHORT_SIZE,
      waitlistCount: waitlistCountByBracket.get(bracket.id) ?? 0,
      isReady: readiness?.isReady ?? false,
      launchedAt: readiness?.launchedAt ?? bracket.launched_at,
    };
  });
  const allRows = registrations
    .map((registration): AdminRegistrationReviewRow => ({
      registrationId: registration.id,
      tournamentId: registration.tournament_id,
      privateAdminNote: registration.admin_notes,
      isDivisionLaunched: Boolean(
        registration.tournament_bracket_id &&
          bracketMetaById.get(registration.tournament_bracket_id)?.launchedAt
      ),
      ...buildAdminRegistrationEvidence({
        playerDisplayName: registration.player_name,
        tournamentName: registration.tournament_title || tournament.title,
        selectedBracket:
          registration.bracket_name ||
          (registration.tournament_bracket_id
            ? bracketMetaById.get(registration.tournament_bracket_id)?.name ?? ""
            : ""),
        submittedElo: registration.submitted_elo,
        verifiedElo: registration.elo_verified_elo,
        verifiedDivision: registration.elo_verified_division,
        verifiedFaction: registration.elo_highest_faction,
        verificationSource: registration.elo_verification_source,
        verificationCheckedAt: registration.elo_checked_at,
        eligibilityRulesVersion: registration.elo_calculation_version,
        status: registration.registration_status,
        registeredAt: registration.created_at,
        waitlistPosition: waitlistPositionById.get(registration.id) ?? null,
        registrationOrder: registrationOrderById.get(registration.id) ?? null,
        waitlistOfferStatus: registration.waitlist_offer_status,
      }),
    }))
    .sort(compareRegistrationRows);
  const sectionRows = allRows.filter((row) =>
    section === "players-waitlist"
      ? row.status === "approved" || row.status === "waitlisted"
      : row.status !== "waitlisted"
  );
  const rows =
    activeFilter === "all"
      ? sectionRows
      : sectionRows.filter((row) => row.status === activeFilter);
  const selectedRegistration =
    allRows.find((row) => row.registrationId === selectedRegistrationId) ??
    null;
  const terminal =
    tournament.status === "cancelled" || tournament.status === "voided";
  const counts = createCounts(allRows, section);
  const waitlistNotices = registrations
    .filter(
      (registration) =>
        registration.registration_status === "waitlisted" &&
        registration.tournament_bracket_id !== null
    )
    .sort(compareWaitlistedRegistrations)
    .map((registration) => ({
      id: registration.id,
      playerName: registration.player_name || "Player",
      bracketName:
        registration.bracket_name ||
        bracketMetaById.get(registration.tournament_bracket_id ?? "")?.name ||
        "Division",
      waitlistPosition: waitlistPositionById.get(registration.id) ?? null,
      offerStatus: registration.waitlist_offer_status,
    }));

  return {
    rows,
    allRows,
    selectedRegistration,
    selectedRegistrationIsTerminal: terminal,
    activeFilter,
    counts,
    cohortSummaries,
    waitlistNotices,
    hasBulkApprovableRegistration: rows.some(
      (registration) =>
        !terminal &&
        !registration.isDivisionLaunched &&
        registration.status !== "waitlisted" &&
        registration.status !== "withdrawn" &&
        registration.status !== "approved"
    ),
  };
}

function createCounts(
  rows: AdminRegistrationReviewRow[],
  section: AdminTournamentRegistrationSection
) {
  const visible = rows.filter((row) =>
    section === "players-waitlist"
      ? row.status === "approved" || row.status === "waitlisted"
      : row.status !== "waitlisted"
  );
  return {
    all: visible.length,
    pending: visible.filter((row) => row.status === "pending").length,
    manual_review: visible.filter((row) => row.status === "manual_review")
      .length,
    approved: visible.filter((row) => row.status === "approved").length,
    rejected: visible.filter((row) => row.status === "rejected").length,
    waitlisted: visible.filter((row) => row.status === "waitlisted").length,
    withdrawn: visible.filter((row) => row.status === "withdrawn").length,
  };
}

function compareRegistrationRows(
  left: AdminRegistrationReviewRow,
  right: AdminRegistrationReviewRow
) {
  return (
    (left.selectedBracket ?? "").localeCompare(right.selectedBracket ?? "") ||
    (left.registrationOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.registrationOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.registrationId.localeCompare(right.registrationId)
  );
}

function compareWaitlistedRegistrations(
  left: SupabaseRegistration,
  right: SupabaseRegistration
) {
  const leftTime = new Date(left.created_at).getTime();
  const rightTime = new Date(right.created_at).getTime();
  return (
    (Number.isFinite(leftTime) ? leftTime : 0) -
      (Number.isFinite(rightTime) ? rightTime : 0) ||
    left.id.localeCompare(right.id)
  );
}

async function requireAdmin() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }
}

import { requireDivisionModelVersion } from "@/lib/division-model";
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
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
import type { TournamentDivisionStateResolution } from "@/lib/tournament-division-state";
import { isActiveReviewCohortStatus } from "@/lib/tournament-registration-cohort";
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
  divisionState: TournamentDivisionStateResolution;
};

export type AdminTournamentRegistrationWorkspaceData = {
  rows: AdminRegistrationReviewRow[];
  selectedRegistration: AdminRegistrationReviewRow | null;
  selectedRegistrationUnavailable: boolean;
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
  page: number;
  pageSize: number;
  pageCount: number;
  filteredCount: number;
};

type RegistrationSummaryRow = Pick<
  SupabaseRegistration,
  | "id"
  | "tournament_id"
  | "tournament_bracket_id"
  | "registration_status"
  | "created_at"
  | "waitlist_offer_status"
>;

const REGISTRATION_SELECT =
  "id, player_name, country, submitted_elo, elo_verified_elo, elo_highest_faction, elo_checked_at, elo_verification_source, elo_verified_division, elo_calculation_version, registration_status, admin_notes, created_at, tournament_id, tournament_bracket_id, tournament_title, bracket_name, waitlist_offer_status";
const REGISTRATION_SUMMARY_SELECT =
  "id, tournament_id, tournament_bracket_id, registration_status, created_at, waitlist_offer_status";
const PAGE_SIZE = 25;
const SUMMARY_BATCH_SIZE = 500;

// Request-local reuse keeps the header and registration workspace on the same
// complete, narrow projection. Advance by the returned length, since the API's
// configured row cap can be smaller than the requested batch.
export const loadAdminTournamentRegistrationSummary = cache(
  async (tournamentIdInput: string): Promise<RegistrationSummaryRow[]> => {
    await requireAdmin();
    const tournamentId = tournamentIdInput.toLowerCase();
    if (!isUuid(tournamentId)) throw new Error("Invalid Tournament.");

    const supabase = createSupabaseAdminClient();
    const rows: RegistrationSummaryRow[] = [];
    const ids = new Set<string>();
    let total: number | null = null;

    do {
      const result = await supabase
        .from("registrations")
        .select(REGISTRATION_SUMMARY_SELECT, { count: "exact" })
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(rows.length, rows.length + SUMMARY_BATCH_SIZE - 1);

      if (
        result.error ||
        !Array.isArray(result.data) ||
        !Number.isSafeInteger(result.count) ||
        result.count! < 0 ||
        (total !== null && result.count !== total)
      ) {
        throwRegistrationLoadError();
      }
      total = result.count!;
      const batch = result.data as RegistrationSummaryRow[];
      if (
        (batch.length === 0 && rows.length < total) ||
        rows.length + batch.length > total
      ) {
        throwRegistrationLoadError();
      }
      for (const row of batch) {
        if (
          row.tournament_id !== tournamentId ||
          ids.has(row.id) ||
          !ALL_FILTERS.slice(1).includes(row.registration_status)
        ) {
          throwRegistrationLoadError();
        }
        ids.add(row.id);
        rows.push(row);
      }
    } while (rows.length < total);

    return rows;
  }
);

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

  return candidate;
}

export async function loadAdminTournamentRegistrationWorkspace(
  tournament: AdminTournamentWorkspaceRow,
  divisionStates: readonly TournamentDivisionStateResolution[],
  {
    filter,
    section,
    selectedRegistrationId,
    page: requestedPage,
  }: {
    filter?: string;
    section: AdminTournamentRegistrationSection;
    selectedRegistrationId?: string;
    page?: string;
  }
): Promise<AdminTournamentRegistrationWorkspaceData> {
  await requireAdmin();
  const activeFilter = getSafeAdminTournamentRegistrationFilter(
    filter,
    section
  );
  const supabase = createSupabaseAdminClient();
  const registrations = await loadAdminTournamentRegistrationSummary(
    tournament.id
  );
  const counts = createCounts(registrations, section);
  const filteredCount = counts[activeFilter];
  const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(getSafePage(requestedPage), pageCount);
  const offset = (page - 1) * PAGE_SIZE;
  const expectedPageLength = Math.min(PAGE_SIZE, filteredCount - offset);
  const expectedPage = registrations.filter((row) =>
    activeFilter !== "all"
      ? row.registration_status === activeFilter
      : section !== "players-waitlist" ||
        row.registration_status === "approved" ||
        row.registration_status === "waitlisted"
  ).slice(offset, offset + expectedPageLength);
  const pageRegistrations: SupabaseRegistration[] = [];
  while (pageRegistrations.length < expectedPageLength) {
    let query = supabase
      .from("registrations")
      .select(REGISTRATION_SELECT, { count: "exact" })
      .eq("tournament_id", tournament.id);
    if (activeFilter !== "all") {
      query = query.eq("registration_status", activeFilter);
    } else if (section === "players-waitlist") {
      query = query.in("registration_status", ["approved", "waitlisted"]);
    }
    const result = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset + pageRegistrations.length, offset + expectedPageLength - 1);
    if (
      result.error ||
      !Array.isArray(result.data) ||
      result.count !== filteredCount ||
      result.data.length === 0 ||
      result.data.length > expectedPageLength - pageRegistrations.length ||
      result.data.some((row, index) => {
        const expected = expectedPage[pageRegistrations.length + index];
        return row.tournament_id !== tournament.id ||
          row.id !== expected?.id ||
          row.registration_status !== expected.registration_status ||
          row.tournament_bracket_id !== expected.tournament_bracket_id ||
          row.created_at !== expected.created_at ||
          row.waitlist_offer_status !== expected.waitlist_offer_status;
      })
    ) {
      throwRegistrationLoadError();
    }
    pageRegistrations.push(...(result.data as SupabaseRegistration[]));
  }
  const selectedResult =
    selectedRegistrationId && isUuid(selectedRegistrationId)
      ? await supabase
          .from("registrations")
          .select(REGISTRATION_SELECT)
          .eq("tournament_id", tournament.id)
          .eq("id", selectedRegistrationId)
          .maybeSingle()
      : null;
  if (selectedResult?.error) throwRegistrationLoadError();
  const selectedRecord = (selectedResult?.data ?? null) as SupabaseRegistration | null;
  if (selectedRecord && selectedRecord.tournament_id !== tournament.id) {
    throwRegistrationLoadError();
  }
  const brackets = tournament.tournament_brackets ?? [];
  const divisionStateByBracket = new Map(
    divisionStates.flatMap((division) =>
      division.bracketId ? [[division.bracketId, division] as const] : []
    )
  );
  const missingBracketState = brackets.find(
    (bracket) => !divisionStateByBracket.has(bracket.id)
  );

  if (missingBracketState) {
    console.error(
      "Admin Tournament registration division-state projection was incomplete.",
      { operation: "load-tournament-registration-division-states" }
    );
    throw new Error("Tournament registrations could not be loaded.");
  }

  const bracketMetaById = new Map(
    brackets.map((bracket) => [
      bracket.id,
      {
        name: getTournamentBracketDisplayName(bracket.name, requireDivisionModelVersion(tournament.division_model_version)),
        launchedAt:
          divisionStateByBracket.get(bracket.id)?.launchedAt ??
          bracket.launched_at,
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
  const waitlistCountByBracket = new Map<string, number>();

  for (const registration of registrations) {
    const bracketId = registration.tournament_bracket_id;
    if (!bracketId) continue;

    if (isActiveReviewCohortStatus(registration.registration_status)) {
      activeCohortCountByBracket.set(
        bracketId,
        (activeCohortCountByBracket.get(bracketId) ?? 0) + 1
      );
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

  const cohortSummaries = brackets.map((bracket) => {
    const divisionState = divisionStateByBracket.get(bracket.id)!;
    return {
      bracketId: bracket.id,
      bracketName: divisionState.displayName,
      activeCohortCount: activeCohortCountByBracket.get(bracket.id) ?? 0,
      approvedCount: divisionState.approvedCount ?? 0,
      requiredCount: divisionState.requiredCount ?? bracket.max_players,
      waitlistCount: waitlistCountByBracket.get(bracket.id) ?? 0,
      isReady: divisionState.isReady,
      launchedAt: divisionState.launchedAt,
      divisionState,
    };
  });
  const mapRegistration = (
    registration: SupabaseRegistration
  ): AdminRegistrationReviewRow => ({
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
  });
  const rows = pageRegistrations.map(mapRegistration);
  const selectedRegistration = selectedRecord
    ? mapRegistration(selectedRecord)
    : null;
  const terminal =
    tournament.status === "cancelled" || tournament.status === "voided";
  const waitlistNotices = pageRegistrations
    .filter(
      (registration) =>
        registration.registration_status === "waitlisted" &&
        registration.tournament_bracket_id !== null
    )
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
    selectedRegistration,
    selectedRegistrationUnavailable: Boolean(
      selectedRegistrationId && !selectedRegistration
    ),
    selectedRegistrationIsTerminal: terminal,
    activeFilter,
    counts,
    cohortSummaries,
    waitlistNotices,
    page,
    pageSize: PAGE_SIZE,
    pageCount,
    filteredCount,
    hasBulkApprovableRegistration: rows.some(
      (registration) =>
        !terminal &&
        !registration.isDivisionLaunched &&
        (registration.status === "pending" ||
          registration.status === "manual_review")
    ),
  };
}

function createCounts(
  rows: RegistrationSummaryRow[],
  section: AdminTournamentRegistrationSection
) {
  const visible = rows.filter((row) =>
    section === "players-waitlist"
      ? row.registration_status === "approved" ||
        row.registration_status === "waitlisted"
      : true
  );
  return {
    all: visible.length,
    pending: visible.filter((row) => row.registration_status === "pending").length,
    manual_review: visible.filter((row) => row.registration_status === "manual_review")
      .length,
    approved: visible.filter((row) => row.registration_status === "approved").length,
    rejected: visible.filter((row) => row.registration_status === "rejected").length,
    waitlisted: visible.filter((row) => row.registration_status === "waitlisted").length,
    withdrawn: visible.filter((row) => row.registration_status === "withdrawn").length,
  };
}

function getSafePage(value?: string) {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function throwRegistrationLoadError(): never {
  console.error("Admin Tournament registration workspace load failed.", {
    operation: "load-tournament-registrations",
  });
  throw new Error("Tournament registrations could not be loaded. Refresh to try again.");
}

async function requireAdmin() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }
}

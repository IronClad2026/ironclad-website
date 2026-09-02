import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { AdminBracketTournamentOption } from "@/components/AdminBracketManagement";
import {
  mapCoh3MapDatabaseRow,
  type Coh3MapDatabaseRow,
  type Coh3MapRow,
} from "@/lib/coh3-maps";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { TournamentDivisionStateResolution } from "@/lib/tournament-division-state";
import { loadTournamentDivisionStates } from "@/lib/tournament-division-state-data";
import {
  getTournamentBracketDisplayName,
  getTournamentBracketSortOrder,
  isTournamentTerminalStatus,
  type TournamentBracketRow,
  type TournamentRow,
} from "@/lib/tournaments";
import type { TournamentDeletionPreview } from "@/components/DeleteTournamentControl";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type AdminTournamentWorkspaceBracket = TournamentBracketRow & {
  map_pool_published_at: string | null;
};

export type AdminTournamentWorkspaceRow = Omit<
  TournamentRow,
  "tournament_brackets"
> & {
  terminal_at: string | null;
  terminal_reason: string | null;
  tournament_brackets?: AdminTournamentWorkspaceBracket[];
};

export type AdminTournamentWorkspaceSummary = {
  totalRegistrations: number;
  pendingReviews: number;
  approvedPlayers: number;
  waitlistedPlayers: number;
  totalCapacity: number;
  generatedDivisions: number;
  launchedDivisions: number;
  divisionStates: readonly TournamentDivisionStateResolution[];
};

export type AdminTournamentEditorWorkspaceData = {
  generatedByBracket: Map<
    string,
    {
      id: string;
      tournament_bracket_id: string;
      format: string;
      slot_count: number;
      generated_at: string;
    }
  >;
  approvedByBracket: Map<string, number>;
  readinessByBracket: Map<
    string,
    {
      bracketId: string;
      approvedCount: number;
      requiredCount: number;
      isReady: boolean;
      launchedAt: string | null;
      notHeldAt: string | null;
    }
  >;
  underReview: {
    seasonName: string;
    at: string | null;
    reason: string | null;
    triggeringTournamentTitle: string;
  } | null;
};

export type AdminTournamentMapPoolWorkspaceData = {
  catalogue: Coh3MapRow[];
  currentMapIdsByBracket: Map<string, string[]>;
};

export const EMPTY_TOURNAMENT_DELETION_PREVIEW: TournamentDeletionPreview = {
  registrations: 0,
  brackets: 0,
  generated_brackets: 0,
  rounds: 0,
  matches: 0,
  standings: 0,
  result_submissions: 0,
  storage_files: 0,
};

export async function loadAdminTournamentWorkspace(tournamentId: string) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const tournamentResult = await supabase
    .from("tournaments")
    .select(
      "id, slug, title, description, banner_image_url, registration_open_at, registration_close_at, start_date, end_date, status, format, prize_pool, rules_url, battlefy_url, registration_enabled, grand_final_at, rule_format, result_confirmation_window_minutes, terminal_at, terminal_reason, created_at, updated_at, tournament_brackets(id, tournament_id, name, elo_rules, max_players, launched_at, map_pool_published_at, created_at, updated_at)"
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentResult.error) {
    console.error("Admin Tournament workspace load failed.", {
      operation: "load-tournament-workspace",
      code: tournamentResult.error.code,
    });
    throw new Error("Tournament management data could not be loaded.");
  }

  if (!tournamentResult.data) {
    return null;
  }

  const tournament = tournamentResult.data as AdminTournamentWorkspaceRow;
  tournament.tournament_brackets = sortBrackets(
    tournament.tournament_brackets ?? []
  );
  const [registrationResult, divisionStatesByTournament] = await Promise.all([
    supabase
      .from("registrations")
      .select("registration_status, tournament_bracket_id")
      .eq("tournament_id", tournamentId),
    loadTournamentDivisionStates(supabase, [tournament]),
  ]);

  if (registrationResult.error) {
    console.error("Admin Tournament workspace summary load failed.", {
      operation: "load-tournament-workspace-summary",
    });
    throw new Error("Tournament management data could not be loaded.");
  }

  const registrations = registrationResult.data ?? [];
  const divisionStates = divisionStatesByTournament.get(tournament.id);

  if (!divisionStates) {
    console.error("Admin Tournament division-state projection was missing.", {
      operation: "load-tournament-workspace-division-states",
    });
    throw new Error("Tournament management data could not be loaded.");
  }

  const summary: AdminTournamentWorkspaceSummary = {
    totalRegistrations: registrations.length,
    pendingReviews: registrations.filter(
      (registration) =>
        registration.registration_status === "pending" ||
        registration.registration_status === "manual_review"
    ).length,
    approvedPlayers: registrations.filter(
      (registration) => registration.registration_status === "approved"
    ).length,
    waitlistedPlayers: registrations.filter(
      (registration) => registration.registration_status === "waitlisted"
    ).length,
    totalCapacity: tournament.tournament_brackets.reduce(
      (total, bracket) => total + bracket.max_players,
      0
    ),
    generatedDivisions: divisionStates.filter(
      (division) => division.generatedBracketId !== null
    ).length,
    launchedDivisions: divisionStates.filter(
      (division) => division.launchedAt !== null
    ).length,
    divisionStates,
  };

  return { tournament, summary };
}

export async function loadAdminTournamentEditorWorkspaceData(
  tournament: AdminTournamentWorkspaceRow,
  divisionStates: readonly TournamentDivisionStateResolution[]
): Promise<AdminTournamentEditorWorkspaceData> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const brackets = tournament.tournament_brackets ?? [];
  const bracketIds = brackets.map((bracket) => bracket.id);
  const [generatedResult, underReviewResult] = await Promise.all([
      bracketIds.length > 0
        ? supabase
            .from("generated_brackets")
            .select(
              "id, tournament_bracket_id, format, slot_count, generated_at"
            )
            .in("tournament_bracket_id", bracketIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("leaderboard_seasons")
        .select(
          "name, under_review_at, under_review_reason, under_review_tournament_id"
        )
        .eq("under_review_tournament_id", tournament.id)
        .not("under_review_at", "is", null)
        .limit(1)
        .maybeSingle(),
    ]);

  if (
    generatedResult.error || underReviewResult.error
  ) {
    console.error("Admin Tournament editor support data load failed.", {
      operation: "load-tournament-editor-data",
    });
    throw new Error("Tournament editor data could not be loaded.");
  }

  const generatedByBracket = new Map(
    ((generatedResult.data ?? []) as Array<{
      id: string;
      tournament_bracket_id: string;
      format: string;
      slot_count: number;
      generated_at: string;
    }>).map((generated) => [generated.tournament_bracket_id, generated])
  );
  const resolutionByBracket = new Map(
    divisionStates.flatMap((division) =>
      division.bracketId ? [[division.bracketId, division] as const] : []
    )
  );
  const missingBracketState = brackets.find(
    (bracket) => !resolutionByBracket.has(bracket.id)
  );

  if (missingBracketState) {
    console.error("Admin Tournament editor division-state projection was incomplete.", {
      operation: "load-tournament-editor-division-states",
    });
    throw new Error("Tournament editor data could not be loaded.");
  }

  const approvedByBracket = new Map(
    brackets.map((bracket) => [
      bracket.id,
      resolutionByBracket.get(bracket.id)?.approvedCount ?? 0,
    ])
  );
  const readinessByBracket = new Map(
    brackets.map((bracket) => {
      const division = resolutionByBracket.get(bracket.id)!;
      return [
        bracket.id,
        {
          bracketId: bracket.id,
          approvedCount: division.approvedCount,
          requiredCount: division.requiredCount,
          isReady: division.isReady,
          launchedAt: division.launchedAt,
          notHeldAt: division.notHeldAt,
        },
      ] as const;
    })
  );
  const underReview = underReviewResult.data as {
    name: string;
    under_review_at: string | null;
    under_review_reason: string | null;
  } | null;

  return {
    generatedByBracket,
    approvedByBracket,
    readinessByBracket,
    underReview: underReview
      ? {
          seasonName: underReview.name,
          at: underReview.under_review_at,
          reason: underReview.under_review_reason,
          triggeringTournamentTitle: tournament.title,
        }
      : null,
  };
}

export async function loadAdminTournamentMapPoolWorkspaceData(
  tournament: AdminTournamentWorkspaceRow
): Promise<AdminTournamentMapPoolWorkspaceData> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const bracketIds = (tournament.tournament_brackets ?? []).map(
    (bracket) => bracket.id
  );
  const [catalogueResult, poolEntriesResult] = await Promise.all([
    supabase
      .from("coh3_maps")
      .select(
        "id, slug, display_name, source_type, creator_name, game_mode, status, thumbnail_path, source_reference, admin_note, created_at, updated_at, created_by_clerk_user_id, updated_by_clerk_user_id"
      )
      .order("display_name", { ascending: true }),
    bracketIds.length > 0
      ? supabase
          .from("tournament_bracket_map_pool_entries")
          .select("tournament_bracket_id, coh3_map_id")
          .in("tournament_bracket_id", bracketIds)
          .is("removed_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (catalogueResult.error || poolEntriesResult.error) {
    console.error("Admin Tournament Map Pool data load failed.", {
      operation: "load-tournament-map-pool",
    });
    throw new Error("Tournament Map Pool data could not be loaded.");
  }

  const currentMapIdsByBracket = new Map<string, string[]>();
  for (const entry of poolEntriesResult.data ?? []) {
    currentMapIdsByBracket.set(entry.tournament_bracket_id, [
      ...(currentMapIdsByBracket.get(entry.tournament_bracket_id) ?? []),
      entry.coh3_map_id,
    ]);
  }

  return {
    catalogue: ((catalogueResult.data ?? []) as Coh3MapDatabaseRow[]).map(
      mapCoh3MapDatabaseRow
    ),
    currentMapIdsByBracket,
  };
}

export async function loadAdminTournamentBracketWorkspaceData(
  tournament: AdminTournamentWorkspaceRow,
  divisionStates: readonly TournamentDivisionStateResolution[]
): Promise<{ tournament: AdminBracketTournamentOption; loadError: boolean }> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const brackets = tournament.tournament_brackets ?? [];
  const bracketIds = brackets.map((bracket) => bracket.id);
  const [registrationResult, generatedResult, mapPoolResult, closureResult] =
    await Promise.all([
      supabase
        .from("registrations")
        .select(
          "id, player_name, country, submitted_elo, registration_status, tournament_bracket_id, waitlist_offer_status"
        )
        .eq("tournament_id", tournament.id),
      bracketIds.length > 0
        ? supabase
            .from("generated_brackets")
            .select(
              "id, tournament_bracket_id, format, slot_count, tournament_matches(player_one_slot, player_two_slot, player_one_registration_id, player_two_registration_id)"
            )
            .in("tournament_bracket_id", bracketIds)
        : Promise.resolve({ data: [], error: null }),
      bracketIds.length > 0
        ? supabase
            .from("tournament_bracket_map_pool_entries")
            .select("tournament_bracket_id")
            .in("tournament_bracket_id", bracketIds)
            .is("removed_at", null)
        : Promise.resolve({ data: [], error: null }),
      bracketIds.length > 0
        ? supabase
            .from("tournament_division_not_held_closures")
            .select(
              "tournament_bracket_id, reason_code, detail, closed_at, closed_by_clerk_user_id, active_registration_count, waitlist_registration_count"
            )
            .in("tournament_bracket_id", bracketIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (
    registrationResult.error ||
    generatedResult.error ||
    mapPoolResult.error ||
    closureResult.error
  ) {
    console.error("Admin Tournament bracket workspace load failed.", {
      operation: "load-tournament-bracket",
    });
    return {
      tournament: {
        id: tournament.id,
        title: tournament.title,
        status: tournament.status,
        brackets: [],
      },
      loadError: true,
    };
  }

  const registrations = registrationResult.data ?? [];
  const generatedByBracket = new Map(
    ((generatedResult.data ?? []) as Array<{
      id: string;
      tournament_bracket_id: string;
      format: "single_elimination" | "round_robin";
      slot_count: number;
      tournament_matches?: Array<{
        player_one_slot: number | null;
        player_two_slot: number | null;
        player_one_registration_id: string | null;
        player_two_registration_id: string | null;
      }>;
    }>).map((generated) => [generated.tournament_bracket_id, generated])
  );
  const currentMapCountByBracket = new Map<string, number>();
  for (const entry of mapPoolResult.data ?? []) {
    currentMapCountByBracket.set(
      entry.tournament_bracket_id,
      (currentMapCountByBracket.get(entry.tournament_bracket_id) ?? 0) + 1
    );
  }
  const closureByBracket = new Map(
    ((closureResult.data ?? []) as Array<{
      tournament_bracket_id: string;
      reason_code: "minimum_roster_not_reached";
      detail: string | null;
      closed_at: string;
      closed_by_clerk_user_id: string;
      active_registration_count: number;
      waitlist_registration_count: number;
    }>).map((closure) => [closure.tournament_bracket_id, closure])
  );

  const divisionStateByBracket = new Map(
    divisionStates.flatMap((division) =>
      division.bracketId ? [[division.bracketId, division] as const] : []
    )
  );
  const loadError = brackets.some(
    (bracket) => !divisionStateByBracket.has(bracket.id)
  );

  if (loadError) {
    console.error(
      "Admin Tournament bracket division-state projection was incomplete.",
      { operation: "load-tournament-bracket-division-states" }
    );
    return {
      tournament: {
        id: tournament.id,
        title: tournament.title,
        status: tournament.status,
        brackets: [],
      },
      loadError: true,
    };
  }

  return {
    tournament: {
      id: tournament.id,
      title: tournament.title,
      status: tournament.status,
      brackets: brackets.map((bracket) => {
        const generated = generatedByBracket.get(bracket.id);
        const divisionState = divisionStateByBracket.get(bracket.id)!;
        const assignments: Record<number, string | null> = {};
        for (const match of generated?.tournament_matches ?? []) {
          if (match.player_one_slot) {
            assignments[match.player_one_slot] =
              match.player_one_registration_id;
          }
          if (match.player_two_slot) {
            assignments[match.player_two_slot] =
              match.player_two_registration_id;
          }
        }

        const approvedParticipants = registrations.filter(
          (registration) =>
            registration.registration_status === "approved" &&
            registration.tournament_bracket_id === bracket.id
        );
        const activeRegistrationCount = registrations.filter(
          (registration) =>
            registration.tournament_bracket_id === bracket.id &&
            (["pending", "manual_review", "approved"].includes(
              registration.registration_status
            ) ||
              (registration.registration_status === "waitlisted" &&
                registration.waitlist_offer_status === "offered"))
        ).length;
        const waitlistRegistrationCount = registrations.filter(
          (registration) =>
            registration.tournament_bracket_id === bracket.id &&
            registration.registration_status === "waitlisted"
        ).length;
        const closure = closureByBracket.get(bracket.id) ?? null;

        return {
          generatedBracketId: generated?.id ?? null,
          bracketId: bracket.id,
          bracketName: getTournamentBracketDisplayName(bracket.name),
          format: generated?.format ?? null,
          slotCount: generated?.slot_count ?? 0,
          actualMatchCount: generated?.tournament_matches?.length ?? 0,
          expectedMatchCount: generated
            ? generated.format === "single_elimination"
              ? generated.slot_count - 1
              : (generated.slot_count * (generated.slot_count - 1)) / 2
            : 0,
          assignments,
          approvedCount:
            divisionState.approvedCount ?? approvedParticipants.length,
          activeRegistrationCount,
          waitlistRegistrationCount,
          requiredCount: divisionState.requiredCount ?? bracket.max_players,
          isReady: divisionState.isReady,
          launchedAt: divisionState.launchedAt,
          divisionState,
          mapPoolPublishedAt: bracket.map_pool_published_at,
          currentMapCount:
            currentMapCountByBracket.get(bracket.id) ?? 0,
          notHeldAudit: closure
            ? {
                reasonCode: closure.reason_code,
                detail: closure.detail,
                closedAt: closure.closed_at,
                closedByClerkUserId: closure.closed_by_clerk_user_id,
                activeRegistrationCount:
                  closure.active_registration_count,
                waitlistRegistrationCount:
                  closure.waitlist_registration_count,
              }
            : null,
          participants: approvedParticipants.map((registration) => ({
            id: registration.id,
            name: registration.player_name,
            country: registration.country || "N/A",
            elo: registration.submitted_elo ?? 0,
          })),
        };
      }),
    },
    loadError,
  };
}

export async function loadAdminTournamentDeletionPreview(
  tournamentId: string
): Promise<TournamentDeletionPreview> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "get_tournament_deletion_preview",
    { p_tournament_id: tournamentId }
  );

  if (error) {
    console.error("Admin Tournament deletion preview load failed.", {
      operation: "load-tournament-deletion-preview",
      code: error.code,
    });
    return EMPTY_TOURNAMENT_DELETION_PREVIEW;
  }

  return (data ?? EMPTY_TOURNAMENT_DELETION_PREVIEW) as TournamentDeletionPreview;
}

function sortBrackets<T extends TournamentBracketRow>(brackets: T[]) {
  return [...brackets].sort(
    (left, right) =>
      getTournamentBracketSortOrder(left.name) -
        getTournamentBracketSortOrder(right.name) ||
      left.name.localeCompare(right.name)
  );
}

async function requireAdmin() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }
}

export function isAdminTournamentWorkspaceTerminal(
  tournament: AdminTournamentWorkspaceRow
) {
  return isTournamentTerminalStatus(tournament.status);
}

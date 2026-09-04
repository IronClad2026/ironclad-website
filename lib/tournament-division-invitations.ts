import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type PlayerTournamentDivisionInvitation = {
  id: string;
  status: "pending" | "accepted" | "declined" | "invalidated";
  createdAt: string;
  invalidationReason: string | null;
  targetTournamentId: string;
  targetTournamentSlug: string;
  targetTournamentTitle: string;
  targetDivisionName: string;
};

export type PlayerTournamentDivisionInvitationState =
  | {
      status: "success";
      invitations: PlayerTournamentDivisionInvitation[];
    }
  | {
      status: "error";
      invitations: [];
    };

export async function loadPlayerTournamentDivisionInvitations(
  clerkUserId: string,
  playerId: string
): Promise<PlayerTournamentDivisionInvitationState> {
  if (!clerkUserId.trim() || !isUuid(playerId)) {
    return { status: "error", invitations: [] };
  }

  const supabase = createSupabaseAdminClient();
  const playerResult = await supabase
    .from("players")
    .select("id")
    .eq("id", playerId)
    .eq("clerk_user_id", clerkUserId)
    .is("account_closed_at", null)
    .maybeSingle();

  if (playerResult.error || playerResult.data?.id !== playerId) {
    logInvitationLoadFailure("verify-player", playerResult.error);
    return { status: "error", invitations: [] };
  }

  const reconciliationResult = await supabase.rpc(
    "reconcile_tournament_division_invitations",
    {
      p_target_tournament_id: null,
      p_target_tournament_bracket_id: null,
      p_recipient_player_id: playerId,
    }
  );

  if (reconciliationResult.error) {
    logInvitationLoadFailure("reconcile", reconciliationResult.error);
    return { status: "error", invitations: [] };
  }

  const invitationResult = await supabase
    .from("tournament_division_invitations")
    .select(
      "id, status, created_at, invalidation_reason, target_tournament_bracket_id"
    )
    .eq("recipient_player_id", playerId)
    .order("created_at", { ascending: false });

  if (invitationResult.error) {
    logInvitationLoadFailure("load-invitations", invitationResult.error);
    return { status: "error", invitations: [] };
  }

  const invitationRows = invitationResult.data ?? [];
  if (invitationRows.length === 0) {
    return { status: "success", invitations: [] };
  }

  const bracketIds = [
    ...new Set(
      invitationRows.map((invitation) => invitation.target_tournament_bracket_id)
    ),
  ];
  const bracketResult = await supabase
    .from("tournament_brackets")
    .select("id, tournament_id, name")
    .in("id", bracketIds);

  if (bracketResult.error) {
    logInvitationLoadFailure("load-target-divisions", bracketResult.error);
    return { status: "error", invitations: [] };
  }

  const bracketsById = new Map(
    (bracketResult.data ?? []).map((bracket) => [bracket.id, bracket])
  );
  const tournamentIds = [
    ...new Set(
      (bracketResult.data ?? []).map((bracket) => bracket.tournament_id)
    ),
  ];
  const tournamentResult = await supabase
    .from("tournaments")
    .select("id, slug, title")
    .in("id", tournamentIds);

  if (tournamentResult.error) {
    logInvitationLoadFailure("load-target-events", tournamentResult.error);
    return { status: "error", invitations: [] };
  }

  const tournamentsById = new Map(
    (tournamentResult.data ?? []).map((tournament) => [tournament.id, tournament])
  );
  const invitations: PlayerTournamentDivisionInvitation[] = [];

  for (const invitation of invitationRows) {
    const bracket = bracketsById.get(invitation.target_tournament_bracket_id);
    const tournament = bracket
      ? tournamentsById.get(bracket.tournament_id)
      : undefined;

    if (
      !bracket ||
      !tournament ||
      !isInvitationStatus(invitation.status) ||
      typeof invitation.created_at !== "string" ||
      !Number.isFinite(Date.parse(invitation.created_at)) ||
      typeof tournament.slug !== "string" ||
      typeof tournament.title !== "string" ||
      typeof bracket.name !== "string"
    ) {
      logInvitationLoadFailure("invalid-projection");
      return { status: "error", invitations: [] };
    }

    invitations.push({
      id: invitation.id,
      status: invitation.status,
      createdAt: invitation.created_at,
      invalidationReason: invitation.invalidation_reason,
      targetTournamentId: tournament.id,
      targetTournamentSlug: tournament.slug,
      targetTournamentTitle: tournament.title,
      targetDivisionName: bracket.name === "Main" ? "Main / Pro" : bracket.name,
    });
  }

  return { status: "success", invitations };
}

function isInvitationStatus(
  value: unknown
): value is PlayerTournamentDivisionInvitation["status"] {
  return (
    value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "invalidated"
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function logInvitationLoadFailure(operation: string, error?: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  console.error("Tournament Division invitation load failed.", {
    operation,
    code: /^[A-Z0-9]{3,10}$/.test(candidateCode)
      ? candidateCode
      : "INVITE_LOAD_FAILED",
  });
}

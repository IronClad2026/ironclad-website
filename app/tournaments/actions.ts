"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isEligibleForBracket } from "@/lib/tournaments";
import {
  isPlayerProfileComplete,
  type PlayerProfile,
} from "@/lib/player-profile";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

type TournamentRegistrationInput = {
  tournamentId: string;
  bracketId: string;
  tournamentTitle: string;
  bracketName: string;
  rulebookAgreement: boolean;
  playerParticipationAgreement: boolean;
  adminFinalDecisionAgreement: boolean;
  ownershipConfirmation: boolean;
};

export type TournamentRegistrationResult = {
  success: boolean;
  message: string;
  requiresProfile?: boolean;
};

export async function submitTournamentRegistration(
  input: TournamentRegistrationInput
): Promise<TournamentRegistrationResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      success: false,
      message: "Sign in before registering for a tournament.",
    };
  }

  if (
    !input.tournamentId.trim() ||
    !input.bracketId.trim() ||
    !input.tournamentTitle.trim() ||
    !input.bracketName.trim() ||
    !input.rulebookAgreement ||
    !input.playerParticipationAgreement ||
    !input.adminFinalDecisionAgreement ||
    !input.ownershipConfirmation
  ) {
    return {
      success: false,
      message: "Complete the tournament selection and required agreements.",
    };
  }

  const supabase = await createAuthenticatedSupabaseClient();
  let tournamentTitle = input.tournamentTitle.trim();
  let bracketName = input.bracketName.trim();
  let tournamentId: string | null = null;
  let tournamentBracketId: string | null = null;

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select(
      "id, title, status, registration_open_at, registration_close_at, start_date, tournament_brackets!inner(id, name, elo_rules, max_players)"
    )
    .eq("id", input.tournamentId)
    .eq("tournament_brackets.id", input.bracketId)
    .maybeSingle();

  if (tournamentError || !tournament) {
    console.error(
      "Tournament registration tournament lookup failed:",
      tournamentError
    );

    return {
      success: false,
      message: "The selected tournament or bracket is no longer available.",
    };
  }

  const selectedBracket = tournament.tournament_brackets?.find(
    (bracket) => bracket.id === input.bracketId
  );
  const now = Date.now();
  const registrationOpens = getOptionalTimestamp(
    tournament.registration_open_at
  );
  const registrationCloses = getOptionalTimestamp(
    tournament.registration_close_at
  );
  const tournamentStarts = getOptionalTimestamp(tournament.start_date);

  if (
    tournament.status !== "registration_open" ||
    registrationOpens === "invalid" ||
    registrationCloses === "invalid" ||
    tournamentStarts === "invalid" ||
    (registrationOpens !== null && now < registrationOpens) ||
    (registrationCloses !== null && now > registrationCloses) ||
    (tournamentStarts !== null && now >= tournamentStarts)
  ) {
    return {
      success: false,
      message: "Registration is not currently open for this tournament.",
    };
  }

  if (!selectedBracket) {
    return {
      success: false,
      message: "The selected bracket is no longer available.",
    };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { count, error: capacityError } = await adminSupabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_bracket_id", selectedBracket.id)
    .neq("registration_status", "rejected");

  if (capacityError) {
    console.error(
      "Tournament registration capacity lookup failed:",
      capacityError
    );

    return {
      success: false,
      message: "IronClad could not verify bracket capacity.",
    };
  }

  if ((count ?? 0) >= selectedBracket.max_players) {
    return {
      success: false,
      message: "The selected bracket is full.",
    };
  }

  tournamentId = tournament.id;
  tournamentBracketId = selectedBracket.id;
  tournamentTitle = tournament.title;
  bracketName = `${selectedBracket.name} Bracket`;

  const { data, error: profileError } = await supabase
    .from("players")
    .select(
      "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, country, region, timezone, current_elo, avatar_url, bio, profile_completed, created_at, updated_at"
    )
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Tournament registration profile lookup failed:", profileError);

    return {
      success: false,
      message: "IronClad could not verify your player profile.",
    };
  }

  const profile = (data ?? null) as PlayerProfile | null;

  if (!isPlayerProfileComplete(profile) || !profile) {
    return {
      success: false,
      message: "Complete your player profile before registering.",
      requiresProfile: true,
    };
  }

  const currentElo = Number(profile.current_elo);

  if (!isEligibleForBracket(currentElo, selectedBracket.elo_rules)) {
    return {
      success: false,
      message: `Your saved ELO of ${currentElo} does not satisfy the ${selectedBracket.name} Bracket requirement: ${selectedBracket.elo_rules}.`,
    };
  }

  const registration = {
    profile_id: profile.id,
    player_name: profile.in_game_name,
    discord_username: profile.discord_username,
    steam_name: profile.steam_username,
    country: profile.country,
    region: profile.region,
    timezone: profile.timezone,
    submitted_elo: profile.current_elo,
    registration_status: "pending",
    elo_status: "pending",
    admin_notes: "",
    tournament_title: tournamentTitle,
    bracket_name: bracketName,
    coh3_player_card_url: profile.coh3_player_card_url,
    clerk_user_id: userId,
    tournament_id: tournamentId,
    tournament_bracket_id: tournamentBracketId,
  };
  const { error: registrationError } = await supabase
    .from("registrations")
    .insert(registration);

  if (registrationError) {
    console.error("IronClad registration submission failed:", registrationError);

    return {
      success: false,
      message: getRegistrationErrorMessage(registrationError),
    };
  }

  revalidatePath("/admin");
  revalidatePath("/tournaments");

  return {
    success: true,
    message: "Registration submitted.",
  };
}

function getOptionalTimestamp(value: string | null) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : "invalid";
}

function getRegistrationErrorMessage(error: {
  code?: string;
  message: string;
}) {
  const message = error.message.toLowerCase();

  if (error.code === "23505") {
    return "You are already registered for this tournament.";
  }

  if (message.includes("full")) {
    return "The selected bracket is full.";
  }

  if (message.includes("registration is not available")) {
    return "Registration is not currently available for this tournament.";
  }

  if (
    message.includes("does not satisfy") ||
    message.includes("invalid elo rule")
  ) {
    return error.message;
  }

  return "Registration could not be submitted. Please try again or contact an admin.";
}

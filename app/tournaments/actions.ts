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
      "id, title, status, registration_open_at, tournament_brackets!inner(id, name, elo_rules, max_players)"
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

  if (
    tournament.status !== "registration_open" ||
    registrationOpens === "invalid" ||
    (registrationOpens !== null && now < registrationOpens)
  ) {
    return {
      success: false,
      message:
        "This tournament is full or already in progress. We hope to see you in the next one.",
    };
  }

  if (!selectedBracket) {
    return {
      success: false,
      message: "The selected bracket is no longer available.",
    };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: capacityRows, error: capacityError } = await adminSupabase
    .from("registrations")
    .select("registration_status")
    .eq("tournament_bracket_id", selectedBracket.id)
    .in("registration_status", ["approved", "waitlisted"]);

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

  const approvedCount = (capacityRows ?? []).filter(
    (registration) => registration.registration_status === "approved"
  ).length;
  const waitlistedCount = (capacityRows ?? []).filter(
    (registration) => registration.registration_status === "waitlisted"
  ).length;
  const waitlistOnly =
    approvedCount >= selectedBracket.max_players || waitlistedCount > 0;

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
    registration_status: waitlistOnly ? "waitlisted" : "pending",
    elo_status: "pending",
    admin_notes: "",
    tournament_title: tournamentTitle,
    bracket_name: bracketName,
    coh3_player_card_url: profile.coh3_player_card_url,
    clerk_user_id: userId,
    tournament_id: tournamentId,
    tournament_bracket_id: tournamentBracketId,
  };
  const { data: savedRegistration, error: registrationError } = await supabase
    .from("registrations")
    .insert(registration)
    .select("id, tournament_bracket_id, registration_status")
    .single();

  if (registrationError) {
    console.error("IronClad registration submission failed:", registrationError);

    return {
      success: false,
      message: getRegistrationErrorMessage(registrationError),
    };
  }

  revalidatePath("/admin");
  revalidatePath("/tournaments");

  const waitlistPosition =
    savedRegistration?.registration_status === "waitlisted" &&
    savedRegistration.tournament_bracket_id
      ? await loadWaitlistPosition(
          adminSupabase,
          savedRegistration.tournament_bracket_id,
          savedRegistration.id
        )
      : null;

  return {
    success: true,
    message:
      savedRegistration?.registration_status === "waitlisted"
        ? `Registration submitted to waitlist${
            waitlistPosition ? ` position #${waitlistPosition}` : ""
          }.`
        : "Registration submitted.",
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
    return "The selected bracket is full for approved players. Waitlist registration may still be available while registration is open.";
  }

  if (message.includes("older waitlisted")) {
    return "This bracket already has a waitlist. New registrations are added behind existing queued players.";
  }

  if (message.includes("registration is not available")) {
    return "This tournament is full or already in progress. We hope to see you in the next one.";
  }

  if (
    message.includes("does not satisfy") ||
    message.includes("invalid elo rule")
  ) {
    return error.message;
  }

  return "Registration could not be submitted. Please try again or contact an admin.";
}

async function loadWaitlistPosition(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tournamentBracketId: string,
  registrationId: string
) {
  const { data, error } = await supabase
    .from("registrations")
    .select("id")
    .eq("tournament_bracket_id", tournamentBracketId)
    .eq("registration_status", "waitlisted")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("Waitlist position lookup failed:", error);
    return null;
  }

  const index = (data ?? []).findIndex(
    (registration) => registration.id === registrationId
  );
  return index >= 0 ? index + 1 : null;
}

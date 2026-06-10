"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  isPlayerProfileComplete,
  type PlayerProfile,
} from "@/lib/player-profile";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

type TournamentRegistrationInput = {
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

  const { error: registrationError } = await supabase
    .from("registrations")
    .insert({
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
      tournament_title: input.tournamentTitle,
      bracket_name: input.bracketName,
      coh3_player_card_url: profile.coh3_player_card_url,
      clerk_user_id: userId,
    });

  if (registrationError) {
    console.error("IronClad registration submission failed:", registrationError);

    return {
      success: false,
      message:
        "Registration could not be submitted. Please try again or contact an admin.",
    };
  }

  revalidatePath("/admin");

  return {
    success: true,
    message: "Registration submitted.",
  };
}

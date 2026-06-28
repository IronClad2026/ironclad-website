"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  parseCoh3StatsProfileUrl,
  type Coh3StatsProfileParseResult,
} from "@/lib/coh3-stats-profile";
import {
  checkCoh3ProfileOwnership,
  COH3_PROFILE_ALREADY_LINKED_MESSAGE,
  isCoh3ProfileAlreadyLinkedError,
} from "@/lib/coh3-profile-ownership";
import { verifyRegistrationEloIdentity } from "@/lib/elo-verification/registration";
import {
  getEloVerificationSetting,
  getEloVerificationSupportLinkSetting,
} from "@/lib/platform-settings";
import { isEligibleForBracket } from "@/lib/tournaments";
import {
  isPlayerProfileComplete,
  isPlayerProfileTournamentReady,
  type PlayerProfile,
} from "@/lib/player-profile";
import { createInAppNotification } from "@/lib/notifications";
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
  coh3PlayerCardUrl?: string;
};

export type TournamentRegistrationResult = {
  success: boolean;
  message: string;
  requiresProfile?: boolean;
  supportUrl?: string;
};

type AuthenticatedSupabaseClient = Awaited<
  ReturnType<typeof createAuthenticatedSupabaseClient>
>;
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type RegistrationError = { code?: string; message: string };
type SavedRegistration = {
  id: string;
  tournament_bracket_id: string | null;
  registration_status: "pending" | "waitlisted" | string;
};
type SuccessfulEloVerification = Extract<
  Awaited<ReturnType<typeof verifyRegistrationEloIdentity>>,
  { ok: true }
>;

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
      "id, title, status, format, registration_open_at, tournament_brackets!inner(id, name, elo_rules, max_players)"
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
      "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, coh3_profile_id, country, region, timezone, current_elo, avatar_url, bio, profile_completed, created_at, updated_at"
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

  let profile = (data ?? null) as PlayerProfile | null;

  if (!profile || !isPlayerProfileComplete(profile)) {
    return {
      success: false,
      message: "Complete your player profile before registering.",
      requiresProfile: true,
    };
  }

  const eloVerificationSetting = await getEloVerificationSetting();
  const eloVerificationSupportLinkSetting = eloVerificationSetting.enabled
    ? await getEloVerificationSupportLinkSetting()
    : null;
  const savedCoh3Profile = parseCoh3StatsProfileUrl(
    profile.coh3_player_card_url
  );
  const submittedCoh3Profile = parseCoh3StatsProfileUrl(
    input.coh3PlayerCardUrl
  );
  const linkedCoh3ProfileId = profile.coh3_profile_id ?? null;
  const effectiveCoh3Profile = eloVerificationSetting.enabled
    ? getEffectiveCoh3Profile({
        linkedProfileId: linkedCoh3ProfileId,
        savedProfile: savedCoh3Profile,
        submittedProfile: submittedCoh3Profile,
      })
    : null;
  const effectiveCoh3ProfileUrl = eloVerificationSetting.enabled
    ? effectiveCoh3Profile?.normalizedUrl ?? null
    : profile.coh3_player_card_url;
  const shouldSaveCanonicalCoh3ProfileUrl =
    eloVerificationSetting.enabled &&
    Boolean(effectiveCoh3ProfileUrl) &&
    profile.coh3_player_card_url !== effectiveCoh3ProfileUrl;
  const registrationProfile = {
    ...profile,
    coh3_player_card_url: effectiveCoh3ProfileUrl,
  };

  if (
    !isPlayerProfileTournamentReady(
      registrationProfile,
      eloVerificationSetting.enabled
    )
  ) {
    return {
      success: false,
      message: "Please enter a valid coh3stats profile URL.",
    };
  }

  if (eloVerificationSetting.enabled && effectiveCoh3Profile) {
    const ownershipCheck = await checkCoh3ProfileOwnership({
      supabase: adminSupabase,
      profileId: effectiveCoh3Profile.profileId,
      playerId: profile.id,
      linkedProfileId: linkedCoh3ProfileId,
    });

    if (!ownershipCheck.ok) {
      return {
        success: false,
        message: ownershipCheck.message,
      };
    }
  }

  const currentElo = Number(profile.current_elo);

  if (!isEligibleForBracket(currentElo, selectedBracket.elo_rules)) {
    return {
      success: false,
      message: `Your saved ELO of ${currentElo} does not satisfy the ${selectedBracket.name} Bracket requirement: ${selectedBracket.elo_rules}.`,
    };
  }

  const verifiedEloResult = eloVerificationSetting.enabled
    ? await verifyRegistrationEloIdentity({
        ign: profile.in_game_name,
        enteredElo: currentElo,
        coh3statsProfileUrl: effectiveCoh3ProfileUrl,
        mode: tournament.format,
        supportUrl: eloVerificationSupportLinkSetting?.url,
      })
    : null;

  if (verifiedEloResult && !verifiedEloResult.ok) {
    return {
      success: false,
      message: verifiedEloResult.message,
      supportUrl: verifiedEloResult.supportUrl,
    };
  }

  const profileUpdates: {
    coh3_player_card_url?: string;
    coh3_profile_id?: string;
    profile_completed?: boolean;
  } = {};

  if (shouldSaveCanonicalCoh3ProfileUrl && effectiveCoh3ProfileUrl) {
    profileUpdates.coh3_player_card_url = effectiveCoh3ProfileUrl;
  }

  if (
    eloVerificationSetting.enabled &&
    verifiedEloResult?.ok &&
    linkedCoh3ProfileId !== verifiedEloResult.profileId
  ) {
    profileUpdates.coh3_profile_id = verifiedEloResult.profileId;
  }

  if (!profile.profile_completed) {
    profileUpdates.profile_completed = true;
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileUpdateError } = await adminSupabase
      .from("players")
      .update(profileUpdates)
      .eq("id", profile.id)
      .eq("clerk_user_id", userId);

    if (profileUpdateError) {
      console.error(
        "Tournament registration profile update failed:",
        profileUpdateError
      );

      if (isCoh3ProfileAlreadyLinkedError(profileUpdateError)) {
        return {
          success: false,
          message: COH3_PROFILE_ALREADY_LINKED_MESSAGE,
        };
      }

      return {
        success: false,
        message:
          "IronClad could not update your player profile for registration.",
      };
    }

    profile = {
      ...profile,
      ...profileUpdates,
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
    coh3_player_card_url: effectiveCoh3ProfileUrl,
    clerk_user_id: userId,
    tournament_id: tournamentId,
    tournament_bracket_id: tournamentBracketId,
  };

  const registrationStatus = waitlistOnly ? "waitlisted" : "pending";
  const savedRegistrationResult = eloVerificationSetting.enabled
    ? await submitVerifiedRegistration({
        adminSupabase,
        profile,
        userId,
        tournamentId,
        tournamentBracketId,
        registrationStatus,
        coh3ProfileUrl: effectiveCoh3ProfileUrl,
        coh3ProfileId: verifiedEloResult?.profileId ?? null,
        verifiedEloResult,
      })
    : await submitDefaultRegistration({
        supabase,
        registration,
      });
  const { data: savedRegistration, error: registrationError } =
    savedRegistrationResult;

  if (registrationError) {
    console.error("IronClad registration submission failed:", registrationError);

    return {
      success: false,
      message: getRegistrationErrorMessage(registrationError),
    };
  }

  if (!savedRegistration) {
    return {
      success: false,
      message:
        "Registration could not be submitted. Please try again or contact an admin.",
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

  await createInAppNotification({
    recipientRole: "admin",
    type: "registration.submitted",
    title: "New Tournament Registration",
    message: `${profile.in_game_name} registered for ${tournamentTitle}.`,
    actorClerkUserId: userId,
    actorDisplayName: profile.in_game_name,
    tournamentId,
    tournamentTitle,
    registrationId: savedRegistration.id,
    metadata: {
      bracketId: tournamentBracketId,
      bracketName,
      registrationStatus: savedRegistration.registration_status,
      waitlistPosition,
    },
  });

  return {
    success: true,
    message:
      savedRegistration.registration_status === "waitlisted"
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

function getEffectiveCoh3Profile({
  linkedProfileId,
  savedProfile,
  submittedProfile,
}: {
  linkedProfileId: string | null;
  savedProfile: Coh3StatsProfileParseResult | null;
  submittedProfile: Coh3StatsProfileParseResult | null;
}) {
  if (
    linkedProfileId &&
    submittedProfile?.profileId === linkedProfileId &&
    savedProfile?.profileId !== linkedProfileId
  ) {
    return submittedProfile;
  }

  return savedProfile ?? submittedProfile;
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

  if (message.includes("coh3stats profile is already linked")) {
    return COH3_PROFILE_ALREADY_LINKED_MESSAGE;
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

async function submitDefaultRegistration({
  supabase,
  registration,
}: {
  supabase: AuthenticatedSupabaseClient;
  registration: Record<string, unknown>;
}): Promise<{ data: SavedRegistration | null; error: RegistrationError | null }> {
  const { data, error } = await supabase
    .from("registrations")
    .insert(registration)
    .select("id, tournament_bracket_id, registration_status")
    .single();

  return {
    data: (data ?? null) as SavedRegistration | null,
    error,
  };
}

async function submitVerifiedRegistration({
  adminSupabase,
  profile,
  userId,
  tournamentId,
  tournamentBracketId,
  registrationStatus,
  coh3ProfileUrl,
  coh3ProfileId,
  verifiedEloResult,
}: {
  adminSupabase: SupabaseAdminClient;
  profile: PlayerProfile;
  userId: string;
  tournamentId: string | null;
  tournamentBracketId: string | null;
  registrationStatus: "pending" | "waitlisted";
  coh3ProfileUrl: string | null;
  coh3ProfileId: string | null;
  verifiedEloResult: SuccessfulEloVerification | null;
}): Promise<{ data: SavedRegistration | null; error: RegistrationError | null }> {
  if (
    !tournamentId ||
    !tournamentBracketId ||
    !coh3ProfileUrl ||
    !coh3ProfileId ||
    !verifiedEloResult
  ) {
    return {
      data: null,
      error: {
        message: "Please enter a valid coh3stats profile URL.",
      },
    };
  }

  const { data, error } = await adminSupabase.rpc(
    "submit_verified_player_registration",
    {
      p_profile_id: profile.id,
      p_clerk_user_id: userId,
      p_player_name: profile.in_game_name,
      p_submitted_elo: profile.current_elo,
      p_coh3_player_card_url: coh3ProfileUrl,
      p_coh3_profile_id: coh3ProfileId,
      p_tournament_id: tournamentId,
      p_tournament_bracket_id: tournamentBracketId,
      p_registration_status: registrationStatus,
    }
  );

  if (error) {
    return { data: null, error };
  }

  const savedRegistration = (
    Array.isArray(data) ? data[0] : data
  ) as SavedRegistration | null;

  if (!savedRegistration?.id) {
    return {
      data: null,
      error: {
        message: "Registration could not be submitted.",
      },
    };
  }

  const { error: verificationUpdateError } = await adminSupabase
    .from("registrations")
    .update({
      elo_status: "verified",
      elo_verified_elo: verifiedEloResult.coh3statsElo,
      elo_difference: verifiedEloResult.difference,
      elo_highest_faction: verifiedEloResult.highestFaction,
      elo_checked_mode: verifiedEloResult.mode,
      elo_checked_at: verifiedEloResult.checkedAt,
      elo_verification_source: "coh3stats",
      elo_verification_error: null,
      elo_verification_payload: {
        profileId: verifiedEloResult.profileId,
        websiteIgn: profile.in_game_name,
        enteredElo: profile.current_elo,
        coh3statsName: verifiedEloResult.coh3statsName,
        coh3statsElo: verifiedEloResult.coh3statsElo,
        highestFaction: verifiedEloResult.highestFaction,
        factionElos: verifiedEloResult.factionElos,
        mode: verifiedEloResult.mode,
        difference: verifiedEloResult.difference,
        tolerance: verifiedEloResult.tolerance,
        withinTolerance:
          verifiedEloResult.difference <= verifiedEloResult.tolerance,
      },
      elo_verified_player_name: verifiedEloResult.coh3statsName,
      elo_identity_status: "matched",
      elo_identity_error: null,
    })
    .eq("id", savedRegistration.id);

  if (verificationUpdateError) {
    console.error(
      "Registration ELO verification metadata update failed:",
      verificationUpdateError
    );

    return {
      data: null,
      error: {
        message:
          "Registration was created, but ELO verification metadata could not be saved. Please contact an admin.",
      },
    };
  }

  return {
    data: {
      ...savedRegistration,
    },
    error: null,
  };
}

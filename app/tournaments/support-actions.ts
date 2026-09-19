"use server";

import { auth } from "@clerk/nextjs/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createInAppNotification } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getPublicPlayerById } from "@/lib/public-players";
import { getMatchRoomHistory } from "@/app/tournaments/room-actions";

const REQUEST_FAILED_MESSAGE =
  "Admin assistance could not be requested. Please try again.";

export type MatchAdminAssistanceResult = {
  success: boolean;
  message: string;
  code:
    | "auth_required"
    | "invalid_request"
    | "unavailable"
    | "participant_only"
    | "request_failed"
    | "requested";
};

export async function requestMatchAdminAssistance(input: {
  matchId: string;
  roomId: string;
  roomRevision: number;
}): Promise<MatchAdminAssistanceResult> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    return failure("Your session could not be verified. Sign in again.", "auth_required");
  }

  if (!userId) {
    return failure("Sign in before requesting admin assistance.", "auth_required");
  }

  try {
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return failure(REQUEST_FAILED_MESSAGE, "request_failed");
  }

  if (!isRecord(input) || !isUuid(input.matchId) || !isUuid(input.roomId) || !Number.isSafeInteger(input.roomRevision) || input.roomRevision < 1) {
    return failure(REQUEST_FAILED_MESSAGE, "invalid_request");
  }

  // Authenticate the exact immutable room, including historical membership.
  // Never resolve a current replacement room for an old assistance request.
  const history = await getMatchRoomHistory({
    roomId: input.roomId,
    afterSequence: 0,
    limit: 1,
  });
  if (!history.ok) {
    return failure("Only a participant in this match can request assistance.", "participant_only");
  }
  const room = history.data.room;
  if (room.matchId !== input.matchId || room.roomRevision !== input.roomRevision) {
    return failure(REQUEST_FAILED_MESSAGE, "invalid_request");
  }
  if (!room.viewerRegistrationId) {
    return failure("Only a participant in this match can request assistance.", "participant_only");
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    return failure(REQUEST_FAILED_MESSAGE, "request_failed");
  }

  try {
    const { data: matchData, error: matchError } = await supabase
      .from("tournament_matches")
      .select(
        "id, match_number, status, player_one_registration_id, player_two_registration_id"
      )
      .eq("id", input.matchId)
      .maybeSingle();

    if (
      matchError ||
      !isMatchRow(matchData)
    ) {
      return failure("Admin assistance is not available for this match.", "unavailable");
    }

    const { data: registrationData, error: registrationError } = await supabase
      .from("registrations")
      .select("id, tournament_id, tournament_title, player_name")
      .eq("id", room.viewerRegistrationId)
      .eq("clerk_user_id", userId)
      .limit(1)
      .maybeSingle();

    if (registrationError || !isRegistrationRow(registrationData)) {
      return failure(
        "Only a participant in this match can request assistance.",
        "participant_only"
      );
    }

    // Dismissal is presentation state, never assistance resolution.
    // Every retry uses the same database-unique event.
    const eventKey = "match-room:" + room.id + ":revision:" + room.roomRevision +
      ":registration:" + registrationData.id + ":admin-assistance";
    const created = await createInAppNotification({
      recipientRole: "admin",
      type: "match.admin_assistance_requested",
      title: "Match Admin Assistance Requested",
      message: `${registrationData.player_name} requested admin assistance for Match #${matchData.match_number}.`,
      actorClerkUserId: userId,
      actorDisplayName: registrationData.player_name,
      tournamentId: registrationData.tournament_id,
      tournamentTitle: registrationData.tournament_title,
      registrationId: registrationData.id,
      matchId: matchData.id,
      eventKey,
      metadata: {
        source: "tournament_match_workspace",
        roomId: room.id,
        roomRevision: room.roomRevision,
      },
    });

    return created ? success() : failure(REQUEST_FAILED_MESSAGE, "request_failed");
  } catch {
    console.error("Match admin assistance request failed unexpectedly.");
    return failure(REQUEST_FAILED_MESSAGE, "request_failed");
  }
}

function success(): MatchAdminAssistanceResult {
  return {
    success: true,
    code: "requested",
    message: "Admin assistance requested. The Tournament team has been notified.",
  };
}

function failure(
  message: string,
  code: MatchAdminAssistanceResult["code"]
): MatchAdminAssistanceResult {
  return { success: false, message, code };
}

function isMatchRow(value: unknown): value is {
  id: string;
  match_number: number;
  status: string;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
} {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    Number.isInteger(value.match_number) &&
    typeof value.status === "string" &&
    isNullableUuid(value.player_one_registration_id) &&
    isNullableUuid(value.player_two_registration_id)
  );
}

function isRegistrationRow(value: unknown): value is {
  id: string;
  tournament_id: string;
  tournament_title: string;
  player_name: string;
} {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    isUuid(value.tournament_id) &&
    isBoundedText(value.tournament_title) &&
    isBoundedText(value.player_name)
  );
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isBoundedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 200
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fetch fresh, opt-in public contact for the immutable room's actual opponent. */
export async function getMatchRoomOpponentDiscord(input: {
  roomId: string;
}): Promise<{ discordUsername: string | null }> {
  try {
    const { userId } = await auth();
    if (!userId || !isRecord(input) || !isUuid(input.roomId)) {
      return { discordUsername: null };
    }
    const history = await getMatchRoomHistory({ roomId: input.roomId, afterSequence: 0, limit: 1 });
    if (!history.ok || !history.data.room.viewerRegistrationId) {
      return { discordUsername: null };
    }
    const room = history.data.room;
    const opponentId = room.viewerRegistrationId === room.playerOneRegistrationId
      ? room.playerTwoRegistrationId : room.playerOneRegistrationId;
    const { data, error } = await createSupabaseAdminClient()
      .from("registrations")
      .select("profile_id")
      .eq("id", opponentId)
      .maybeSingle();
    if (error || !isRecord(data) || !isUuid(data.profile_id)) {
      return { discordUsername: null };
    }
    const profile = await getPublicPlayerById(data.profile_id);
    return {
      discordUsername: profile?.publicProfileEnabled && profile.discordPublicEnabled
        ? profile.discordUsername : null,
    };
  } catch {
    return { discordUsername: null };
  }
}

"use server";

import { auth } from "@clerk/nextjs/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createInAppNotification } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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

type AssistanceRequestRow = {
  id: string;
  in_app_hidden_at: string | null;
};

export async function requestMatchAdminAssistance(input: {
  matchId: string;
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

  await requireCurrentAccountLegalAcceptance();

  if (!isRecord(input) || !isUuid(input.matchId)) {
    return failure(REQUEST_FAILED_MESSAGE, "invalid_request");
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
      !isMatchRow(matchData) ||
      matchData.status === "completed"
    ) {
      return failure("Admin assistance is not available for this match.", "unavailable");
    }

    const participantIds = [
      matchData.player_one_registration_id,
      matchData.player_two_registration_id,
    ].filter((value): value is string => typeof value === "string");

    if (participantIds.length === 0) {
      return failure("Admin assistance is not available for this match.", "unavailable");
    }

    const { data: registrationData, error: registrationError } = await supabase
      .from("registrations")
      .select("id, tournament_id, tournament_title, player_name")
      .in("id", participantIds)
      .eq("clerk_user_id", userId)
      .limit(1)
      .maybeSingle();

    if (registrationError || !isRegistrationRow(registrationData)) {
      return failure(
        "Only a participant in this match can request assistance.",
        "participant_only"
      );
    }

    const { data: previousRequests, error: previousRequestError } =
      await supabase
        .from("notifications")
        .select("id, in_app_hidden_at")
        .eq("recipient_role", "admin")
        .eq("type", "match.admin_assistance_requested")
        .eq("actor_clerk_user_id", userId)
        .eq("match_id", input.matchId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);

    if (previousRequestError) {
      return failure(REQUEST_FAILED_MESSAGE, "request_failed");
    }

    if (
      !Array.isArray(previousRequests) ||
      previousRequests.length > 1
    ) {
      return failure(REQUEST_FAILED_MESSAGE, "request_failed");
    }

    let previousRequest: AssistanceRequestRow | null = null;

    if (previousRequests.length === 1) {
      const candidate = previousRequests[0];

      if (!isAssistanceRequestRow(candidate)) {
        return failure(REQUEST_FAILED_MESSAGE, "request_failed");
      }

      previousRequest = candidate;
    }

    if (previousRequest?.in_app_hidden_at === null) {
      return success();
    }

    const requestCycle = previousRequest
      ? `after:${previousRequest.id}`
      : "initial";
    const eventKey =
      `match:${input.matchId}:registration:${registrationData.id}:` +
      `admin-assistance-request:${requestCycle}`;

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

function isAssistanceRequestRow(value: unknown): value is AssistanceRequestRow {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    (value.in_app_hidden_at === null ||
      typeof value.in_app_hidden_at === "string")
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

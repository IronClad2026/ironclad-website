"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type NotificationDismissalResult = {
  status: "success" | "error";
  message: string;
  dismissedIds: string[];
};

export async function dismissDashboardNotifications(
  formData: FormData
): Promise<NotificationDismissalResult> {
  const { userId } = await auth();

  if (!userId) {
    return errorResult("Sign in before managing notifications.");
  }

  const deleteAll = formData.get("deleteAll") === "true";
  const notificationIds = [
    ...new Set(
      formData
        .getAll("notificationId")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => UUID_PATTERN.test(value))
    ),
  ];

  if (!deleteAll && notificationIds.length === 0) {
    return errorResult("Select at least one notification.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: registrationData, error: registrationError } = await supabase
    .from("registrations")
    .select("id")
    .eq("clerk_user_id", userId);

  if (registrationError) {
    console.error("Notification registration lookup failed:", registrationError);
    return errorResult("Your notifications could not be updated.");
  }

  const registrationIds = (registrationData ?? []).map(
    (registration) => registration.id as string
  );

  if (registrationIds.length === 0) {
    return errorResult("No player notifications are available.");
  }

  const [playerOneMatches, playerTwoMatches] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select("id")
      .in("player_one_registration_id", registrationIds),
    supabase
      .from("tournament_matches")
      .select("id")
      .in("player_two_registration_id", registrationIds),
  ]);

  const matchError = playerOneMatches.error ?? playerTwoMatches.error;
  if (matchError) {
    console.error("Notification match lookup failed:", matchError);
    return errorResult("Your notifications could not be updated.");
  }

  const matchIds = [
    ...new Set(
      [
        ...(playerOneMatches.data ?? []),
        ...(playerTwoMatches.data ?? []),
      ].map((match) => match.id as string)
    ),
  ];

  if (matchIds.length === 0) {
    return errorResult("No player notifications are available.");
  }

  const submissionQuery = supabase
    .from("match_result_submissions")
    .select("id, status")
    .in("match_id", matchIds);
  const { data: submissionData, error: submissionError } = deleteAll
    ? await submissionQuery
    : await submissionQuery.in("id", notificationIds);

  if (submissionError) {
    console.error("Notification submission lookup failed:", submissionError);
    return errorResult("Your notifications could not be updated.");
  }

  const authorizedSubmissions = (submissionData ?? []) as {
    id: string;
    status: string;
  }[];
  let targetSubmissions = authorizedSubmissions;

  if (
    !deleteAll &&
    authorizedSubmissions.length !== notificationIds.length
  ) {
    return errorResult("One or more notifications are not available.");
  }

  if (deleteAll && authorizedSubmissions.length > 0) {
    const { data: dismissalData, error: existingDismissalError } =
      await supabase
        .from("player_notification_dismissals")
        .select("submission_id, dismissed_status")
        .eq("clerk_user_id", userId)
        .in(
          "submission_id",
          authorizedSubmissions.map((submission) => submission.id)
        );

    if (existingDismissalError) {
      console.error(
        "Existing notification dismissal lookup failed:",
        existingDismissalError
      );
      return errorResult("Your notifications could not be updated.");
    }

    const existingDismissals = new Set(
      (dismissalData ?? []).map(
        (dismissal) =>
          `${dismissal.submission_id as string}:${
            dismissal.dismissed_status as string
          }`
      )
    );
    targetSubmissions = authorizedSubmissions.filter(
      (submission) =>
        !existingDismissals.has(`${submission.id}:${submission.status}`)
    );
  }

  if (targetSubmissions.length === 0) {
    return {
      status: "success",
      message: "All notifications are already deleted.",
      dismissedIds: [],
    };
  }

  const authorizedIds = targetSubmissions.map(
    (submission) => submission.id
  );
  const { error: dismissalError } = await supabase
    .from("player_notification_dismissals")
    .upsert(
      targetSubmissions.map((submission) => ({
        clerk_user_id: userId,
        submission_id: submission.id,
        dismissed_status: submission.status,
      })),
      {
        onConflict:
          "clerk_user_id,submission_id,dismissed_status",
      }
    );

  if (dismissalError) {
    console.error("Notification dismissal failed:", dismissalError);
    return errorResult("Your notifications could not be deleted.");
  }

  revalidatePath("/dashboard");
  return {
    status: "success",
    message:
      authorizedIds.length === 1
        ? "Notification deleted."
        : `${authorizedIds.length} notifications deleted.`,
    dismissedIds: authorizedIds,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResult(message: string): NotificationDismissalResult {
  return {
    status: "error",
    message,
    dismissedIds: [],
  };
}

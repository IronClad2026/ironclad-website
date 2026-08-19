"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  notifyAdminsOfMatchDispute,
  notifyNoShowReporterOfResponse,
} from "@/lib/notification-events";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export type NotificationDismissalResult = {
  status: "success" | "error";
  code:
    | "sign-in-required"
    | "selection-required"
    | "update-failed"
    | "unavailable"
    | "notification-unavailable"
    | "already-deleted"
    | "deleted";
  message: string;
  dismissedIds: string[];
};

export type NotificationActionResult = {
  status: "success" | "error";
  code:
    | "sign-in-required"
    | "result-unavailable"
    | "confirm-failed"
    | "confirmed"
    | "dispute-notes-too-long"
    | "dispute-failed"
    | "disputed";
  message: string;
};

export type DiscordVisibilityActionResult = {
  status: "success" | "error";
  code:
    | "sign-in-required"
    | "invalid-value"
    | "update-failed"
    | "profile-required"
    | "username-required"
    | "enabled"
    | "disabled";
  message: string;
  enabled: boolean;
};

type NotificationIdentifier = {
  source: "submission" | "report_group";
  id: string;
  key: string;
};

export async function dismissDashboardNotifications(
  formData: FormData
): Promise<NotificationDismissalResult> {
  const { userId } = await auth();

  if (!userId) {
    return errorResult(
      "sign-in-required",
      "Sign in before managing notifications."
    );
  }

  const deleteAll = formData.get("deleteAll") === "true";
  const notificationIds = [
    ...new Map(
      formData
        .getAll("notificationId")
        .filter((value): value is string => typeof value === "string")
        .map(parseNotificationIdentifier)
        .filter(
          (identifier): identifier is NotificationIdentifier =>
            identifier !== null
        )
        .map((identifier) => [identifier.key, identifier])
    ).values(),
  ];

  if (!deleteAll && notificationIds.length === 0) {
    return errorResult(
      "selection-required",
      "Select at least one notification."
    );
  }

  const supabase = createSupabaseAdminClient();
  const matchIds = await loadViewerMatchIds(supabase, userId);

  if (matchIds === null) {
    return errorResult(
      "update-failed",
      "Your notifications could not be updated."
    );
  }

  if (matchIds.length === 0) {
    return errorResult(
      "unavailable",
      "No player notifications are available."
    );
  }

  const requestedSubmissionIds = notificationIds
    .filter((notification) => notification.source === "submission")
    .map((notification) => notification.id);
  const requestedReportGroupIds = notificationIds
    .filter((notification) => notification.source === "report_group")
    .map((notification) => notification.id);

  const [submissionResult, reportGroupResult] = await Promise.all([
    loadAuthorizedSubmissions(
      supabase,
      matchIds,
      deleteAll ? null : requestedSubmissionIds
    ),
    loadAuthorizedReportGroups(
      supabase,
      matchIds,
      deleteAll ? null : requestedReportGroupIds
    ),
  ]);

  const lookupError = submissionResult.error ?? reportGroupResult.error;
  if (lookupError) {
    logDashboardResultFailure("load-notifications", lookupError);
    return errorResult(
      "update-failed",
      "Your notifications could not be updated."
    );
  }

  const authorizedSubmissions = submissionResult.data;
  const authorizedReportGroups = reportGroupResult.data;

  if (
    !deleteAll &&
    authorizedSubmissions.length + authorizedReportGroups.length !==
      notificationIds.length
  ) {
    return errorResult(
      "notification-unavailable",
      "One or more notifications are not available."
    );
  }

  let targetSubmissions = authorizedSubmissions;
  let targetReportGroups = authorizedReportGroups;

  if (deleteAll) {
    const filtered = await filterAlreadyDismissed(
      supabase,
      userId,
      authorizedSubmissions,
      authorizedReportGroups
    );

    if (filtered === null) {
      return errorResult(
        "update-failed",
        "Your notifications could not be updated."
      );
    }

    targetSubmissions = filtered.submissions;
    targetReportGroups = filtered.reportGroups;
  }

  if (targetSubmissions.length === 0 && targetReportGroups.length === 0) {
    return {
      status: "success",
      code: "already-deleted",
      message: "All notifications are already deleted.",
      dismissedIds: [],
    };
  }

  const [submissionDismissalResult, groupDismissalResult] = await Promise.all([
    targetSubmissions.length > 0
      ? supabase
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
          )
      : Promise.resolve({ error: null }),
    targetReportGroups.length > 0
      ? supabase
          .from("player_report_group_notification_dismissals")
          .upsert(
            targetReportGroups.map((reportGroup) => ({
              clerk_user_id: userId,
              report_group_id: reportGroup.id,
              dismissed_status: reportGroup.status,
            })),
            {
              onConflict:
                "clerk_user_id,report_group_id,dismissed_status",
            }
          )
      : Promise.resolve({ error: null }),
  ]);

  const dismissalError =
    submissionDismissalResult.error ?? groupDismissalResult.error;
  if (dismissalError) {
    logDashboardResultFailure("dismiss-notifications", dismissalError);
    return errorResult(
      "update-failed",
      "Your notifications could not be deleted."
    );
  }

  const dismissedIds = [
    ...targetSubmissions.map((submission) => `submission:${submission.id}`),
    ...targetReportGroups.map((reportGroup) => `report_group:${reportGroup.id}`),
  ];

  revalidatePath("/dashboard");
  return {
    status: "success",
    code: "deleted",
    message:
      dismissedIds.length === 1
        ? "Notification deleted."
        : `${dismissedIds.length} notifications deleted.`,
    dismissedIds,
  };
}

export async function confirmDashboardMatchResult(
  formData: FormData
): Promise<NotificationActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return actionErrorResult(
      "sign-in-required",
      "Sign in before confirming a match result."
    );
  }

  const reportGroupId = getUuid(formData, "reportGroupId");
  if (!reportGroupId) {
    return actionErrorResult(
      "result-unavailable",
      "The match result confirmation could not be found."
    );
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("confirm_match_result_report_group", {
    p_report_group_id: reportGroupId,
    p_confirmed_by_clerk_user_id: userId,
  });

  if (error) {
    logDashboardResultFailure("confirm-match-result", error);
    return actionErrorResult(
      "confirm-failed",
      "The match result could not be confirmed. Please try again."
    );
  }

  await notifyNoShowReporterOfResponse(supabase, {
    reportGroupId,
    decision: "confirmed",
  });

  revalidateDashboardPaths();
  return {
    status: "success",
    code: "confirmed",
    message: "Result confirmed. The bracket has been updated.",
  };
}

export async function disputeDashboardMatchResult(
  formData: FormData
): Promise<NotificationActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return actionErrorResult(
      "sign-in-required",
      "Sign in before disputing a match result."
    );
  }

  const reportGroupId = getUuid(formData, "reportGroupId");
  const disputeNotes = String(formData.get("disputeNotes") ?? "").trim();

  if (!reportGroupId) {
    return actionErrorResult(
      "result-unavailable",
      "The match result confirmation could not be found."
    );
  }

  if (disputeNotes.length > 2000) {
    return actionErrorResult(
      "dispute-notes-too-long",
      "Dispute notes must be 2000 characters or fewer."
    );
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("dispute_match_result_report_group", {
    p_report_group_id: reportGroupId,
    p_disputed_by_clerk_user_id: userId,
    p_dispute_notes: disputeNotes || null,
  });

  if (error) {
    logDashboardResultFailure("dispute-match-result", error);
    return actionErrorResult(
      "dispute-failed",
      "The match result could not be disputed. Please try again."
    );
  }

  await notifyAdminsOfMatchDispute(supabase, reportGroupId, userId);
  await notifyNoShowReporterOfResponse(supabase, {
    reportGroupId,
    decision: "disputed",
  });

  revalidateDashboardPaths();
  return {
    status: "success",
    code: "disputed",
    message: "Result disputed. An administrator must review it.",
  };
}

export async function updateDiscordPublicEnabled(
  enabled: boolean
): Promise<DiscordVisibilityActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      status: "error",
      code: "sign-in-required",
      message: "Sign in before updating Discord contact visibility.",
      enabled: false,
    };
  }

  if (typeof enabled !== "boolean") {
    return {
      status: "error",
      code: "invalid-value",
      message: "Choose whether Discord contact should be public.",
      enabled: false,
    };
  }

  const nextEnabled = enabled;
  const supabase = await createAuthenticatedSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("players")
    .select("id, discord_username, discord_public_enabled")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Discord contact visibility profile lookup failed:",
      profileError
    );
    return {
      status: "error",
      code: "update-failed",
      message: "Discord contact visibility could not be updated.",
      enabled: !nextEnabled,
    };
  }

  if (!profile) {
    return {
      status: "error",
      code: "profile-required",
      message: "Complete your player profile before changing this setting.",
      enabled: false,
    };
  }

  const hasDiscordUsername = Boolean(
    typeof profile.discord_username === "string" &&
      profile.discord_username.trim()
  );

  if (nextEnabled && !hasDiscordUsername) {
    const { error: disableError } = await supabase
      .from("players")
      .update({ discord_public_enabled: false })
      .eq("clerk_user_id", userId);

    if (disableError) {
      console.error(
        "Discord contact visibility neutralization failed:",
        disableError
      );
    }

    revalidateDiscordVisibilityPaths(profile.id as string);

    return {
      status: "error",
      code: "username-required",
      message:
        "Add an optional Discord username to your profile before making it public.",
      enabled: false,
    };
  }

  const { data, error } = await supabase
    .from("players")
    .update({ discord_public_enabled: nextEnabled })
    .eq("clerk_user_id", userId)
    .select("id, discord_public_enabled")
    .maybeSingle();

  if (error) {
    console.error("Discord contact visibility update failed:", error);
    return {
      status: "error",
      code: "update-failed",
      message: "Discord contact visibility could not be updated.",
      enabled: !nextEnabled,
    };
  }

  if (!data) {
    return {
      status: "error",
      code: "update-failed",
      message: "Discord contact visibility could not be updated.",
      enabled: Boolean(profile.discord_public_enabled),
    };
  }

  revalidateDiscordVisibilityPaths(data.id as string);

  return {
    status: "success",
    code: nextEnabled ? "enabled" : "disabled",
    message: nextEnabled
      ? "Discord contact is visible on your public profile."
      : "Discord contact is hidden from your public profile.",
    enabled: Boolean(data.discord_public_enabled),
  };
}

function revalidateDiscordVisibilityPaths(playerId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
}

async function loadViewerMatchIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const { data: registrationData, error: registrationError } = await supabase
    .from("registrations")
    .select("id")
    .eq("clerk_user_id", userId);

  if (registrationError) {
    logDashboardResultFailure(
      "load-notification-registrations",
      registrationError
    );
    return null;
  }

  const registrationIds = (registrationData ?? []).map(
    (registration) => registration.id as string
  );

  if (registrationIds.length === 0) {
    return [];
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
    logDashboardResultFailure("load-notification-matches", matchError);
    return null;
  }

  return [
    ...new Set(
      [
        ...(playerOneMatches.data ?? []),
        ...(playerTwoMatches.data ?? []),
      ].map((match) => match.id as string)
    ),
  ];
}

async function loadAuthorizedSubmissions(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  matchIds: string[],
  submissionIds: string[] | null
) {
  if (submissionIds !== null && submissionIds.length === 0) {
    return { data: [] as NotificationSubmission[], error: null };
  }

  let query = supabase
    .from("match_result_submissions")
    .select("id, status")
    .in("match_id", matchIds)
    .is("report_group_id", null);

  if (submissionIds !== null) {
    query = query.in("id", submissionIds);
  }

  const { data, error } = await query;
  return {
    data: (data ?? []) as NotificationSubmission[],
    error,
  };
}

async function loadAuthorizedReportGroups(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  matchIds: string[],
  reportGroupIds: string[] | null
) {
  if (reportGroupIds !== null && reportGroupIds.length === 0) {
    return { data: [] as NotificationReportGroup[], error: null };
  }

  let query = supabase
    .from("match_result_report_groups")
    .select("id, status")
    .in("match_id", matchIds);

  if (reportGroupIds !== null) {
    query = query.in("id", reportGroupIds);
  }

  const { data, error } = await query;
  return {
    data: (data ?? []) as NotificationReportGroup[],
    error,
  };
}

async function filterAlreadyDismissed(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  submissions: NotificationSubmission[],
  reportGroups: NotificationReportGroup[]
) {
  const [submissionDismissals, groupDismissals] = await Promise.all([
    submissions.length > 0
      ? supabase
          .from("player_notification_dismissals")
          .select("submission_id, dismissed_status")
          .eq("clerk_user_id", userId)
          .in(
            "submission_id",
            submissions.map((submission) => submission.id)
          )
      : Promise.resolve({ data: [], error: null }),
    reportGroups.length > 0
      ? supabase
          .from("player_report_group_notification_dismissals")
          .select("report_group_id, dismissed_status")
          .eq("clerk_user_id", userId)
          .in(
            "report_group_id",
            reportGroups.map((reportGroup) => reportGroup.id)
          )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const dismissalError = submissionDismissals.error ?? groupDismissals.error;
  if (dismissalError) {
    logDashboardResultFailure(
      "load-existing-notification-dismissals",
      dismissalError
    );
    return null;
  }

  const dismissed = new Set(
    (submissionDismissals.data ?? []).map(
      (dismissal) =>
        `submission:${dismissal.submission_id as string}:${
          dismissal.dismissed_status as string
        }`
    )
  );

  for (const dismissal of groupDismissals.data ?? []) {
    dismissed.add(
      `report_group:${dismissal.report_group_id as string}:${
        dismissal.dismissed_status as string
      }`
    );
  }

  return {
    submissions: submissions.filter(
      (submission) =>
        !dismissed.has(`submission:${submission.id}:${submission.status}`)
    ),
    reportGroups: reportGroups.filter(
      (reportGroup) =>
        !dismissed.has(`report_group:${reportGroup.id}:${reportGroup.status}`)
    ),
  };
}

type NotificationSubmission = {
  id: string;
  status: string;
};

type NotificationReportGroup = {
  id: string;
  status: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseNotificationIdentifier(
  value: string
): NotificationIdentifier | null {
  const trimmed = value.trim();
  const [source, id] = trimmed.includes(":")
    ? trimmed.split(":", 2)
    : ["submission", trimmed];

  if (
    (source !== "submission" && source !== "report_group") ||
    !UUID_PATTERN.test(id)
  ) {
    return null;
  }

  return {
    source,
    id,
    key: `${source}:${id}`,
  };
}

function getUuid(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return UUID_PATTERN.test(value) ? value : null;
}

function revalidateDashboardPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");
  revalidatePath("/admin");
  revalidatePath("/admin/tournaments");
}

function errorResult(
  code: NotificationDismissalResult["code"],
  message: string
): NotificationDismissalResult {
  return {
    status: "error",
    code,
    message,
    dismissedIds: [],
  };
}

function actionErrorResult(
  code: NotificationActionResult["code"],
  message: string
): NotificationActionResult {
  return {
    status: "error",
    code,
    message,
  };
}

function logDashboardResultFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "RESULT_FAILED";

  console.error("Dashboard match result operation failed.", {
    operation,
    code,
  });
}

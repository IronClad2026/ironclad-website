"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import {
  createInAppNotification,
  type NotificationCreateInput,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { AdminRegistrationStatus } from "@/lib/admin-registration-review";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type RegistrationStatus = AdminRegistrationStatus;
type FilterStatus = "all" | RegistrationStatus;
type AdminFocusTarget = "note" | "reject" | "manual_review";
type AdminNotice =
  | "note-required"
  | "saved"
  | "save-failed"
  | "registration-deleted"
  | "registration-delete-failed"
  | "registration-delete-blocked"
  | "bracket-full"
  | "registration-closed"
  | "registration-locked"
  | "registration-bulk-approved"
  | "registration-bulk-partial"
  | "registration-bulk-failed";
type WorkspaceSection = "registrations" | "players-waitlist";
type WorkspaceRedirectContext = {
  tournamentId: string;
  section: WorkspaceSection;
};

function getSafeFilter(filter?: string): FilterStatus {
  const validFilters: FilterStatus[] = [
    "all",
    "pending",
    "manual_review",
    "approved",
    "rejected",
    "waitlisted",
    "withdrawn",
  ];

  return validFilters.includes(filter as FilterStatus)
    ? (filter as FilterStatus)
    : "all";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getWorkspaceRedirectContext(
  formData: FormData
): WorkspaceRedirectContext | null {
  const tournamentId = String(
    formData.get("workspaceTournamentId") || ""
  ).trim();
  const section = String(formData.get("workspaceSection") || "").trim();

  if (
    !isUuid(tournamentId) ||
    (section !== "registrations" && section !== "players-waitlist")
  ) {
    return null;
  }

  return {
    tournamentId,
    section,
  };
}

function buildHref(
  {
    filter,
    selected,
    notice,
    detail,
    focus,
  }: {
    filter: FilterStatus;
    selected?: string;
    notice?: AdminNotice;
    detail?: string;
    focus?: AdminFocusTarget;
  },
  workspaceContext: WorkspaceRedirectContext | null
) {
  const params = new URLSearchParams();

  if (workspaceContext) {
    params.set("section", workspaceContext.section);
  }

  params.set("filter", filter);

  if (selected) {
    params.set("selected", selected);
  }

  if (notice) {
    params.set("notice", notice);
  }

  if (detail) {
    params.set("detail", detail);
  }

  if (focus) {
    params.set("focus", focus);
  }

  const basePath = workspaceContext
    ? `/admin/tournaments/${workspaceContext.tournamentId}`
    : "/admin/registrations";

  return `${basePath}?${params.toString()}`;
}

function revalidateRegistrationPaths(
  workspaceContext: WorkspaceRedirectContext | null,
  includeAdminTournaments = false
) {
  revalidatePath("/admin");
  revalidatePath("/admin/registrations");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");

  if (includeAdminTournaments) {
    revalidatePath("/admin/tournaments");
  }

  if (workspaceContext) {
    revalidatePath(`/admin/tournaments/${workspaceContext.tournamentId}`);
  }
}

function describeRegistrationUpdateFailure(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("bracket is full")) {
    return "bracket capacity is full";
  }

  if (lowerMessage.includes("registration is not available")) {
    return "registration is closed or the tournament is locked";
  }

  if (
    lowerMessage.includes("roster is locked") ||
    lowerMessage.includes("bracket generation")
  ) {
    return "bracket roster is locked after bracket generation";
  }

  if (lowerMessage.includes("elo")) {
    return "player does not satisfy the bracket ELO rules";
  }

  return message;
}

function buildBulkApprovalDetail(failures: string[], approvedCount: number) {
  const visibleFailures = failures.slice(0, 8);
  const remaining = failures.length - visibleFailures.length;
  const prefix =
    approvedCount > 0
      ? `${approvedCount} registration(s) approved. `
      : "No registrations were approved. ";
  const suffix =
    remaining > 0 ? ` ${remaining} additional failure(s) omitted.` : "";

  return `${prefix}${visibleFailures.join("; ")}.${suffix}`.slice(0, 900);
}

function buildRegistrationStatusNotification({
  previousStatus,
  nextStatus,
  registration,
  actorClerkUserId,
  rejectionEventKey,
}: {
  previousStatus: RegistrationStatus;
  nextStatus: RegistrationStatus;
  registration: {
    id: string;
    clerk_user_id: string | null;
    player_name: string | null;
    tournament_id: string | null;
    tournament_title: string | null;
    bracket_name: string | null;
  };
  actorClerkUserId: string;
  rejectionEventKey: string | null;
}): NotificationCreateInput | null {
  if (!registration.clerk_user_id || previousStatus === nextStatus) {
    return null;
  }

  const tournamentTitle = registration.tournament_title || "this tournament";
  const base = {
    recipientClerkUserId: registration.clerk_user_id,
    recipientRole: "player" as const,
    actorClerkUserId,
    actorDisplayName: "IronClad Admin",
    tournamentId: registration.tournament_id,
    tournamentTitle: registration.tournament_title,
    registrationId: registration.id,
    metadata: {
      previousStatus,
      nextStatus,
      bracketName: registration.bracket_name,
    },
  };

  if (nextStatus === "rejected") {
    if (!rejectionEventKey) {
      return null;
    }

    return {
      ...base,
      type: "registration.rejected",
      title: "Registration Rejected",
      message: `Your registration for ${tournamentTitle} has been rejected.`,
      eventKey: rejectionEventKey,
    };
  }

  if (nextStatus === "waitlisted") {
    return {
      ...base,
      type: "registration.waitlisted",
      title: "Waitlist Status",
      message: `You have been added to the waitlist for ${tournamentTitle}.`,
    };
  }

  if (nextStatus === "manual_review") {
    return {
      ...base,
      type: "registration.manual_review",
      title: "Registration Under Review",
      message: `Your registration for ${tournamentTitle} is currently under manual review.`,
    };
  }

  return null;
}

export async function updateRegistrationStatus(formData: FormData) {
  "use server";

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  await requireCurrentAccountLegalAcceptance();

  const workspaceContext = getWorkspaceRedirectContext(formData);
  const registrationId = String(formData.get("registrationId") || "");
  const nextStatus = String(
    formData.get("nextStatus") || ""
  ) as RegistrationStatus;
  const activeFilter = getSafeFilter(
    String(formData.get("activeFilter") || "all")
  );
  const selected = String(formData.get("selected") || "");
  const adminNotes = String(formData.get("adminNotes") || "").trim();

  const validStatuses: RegistrationStatus[] = [
    "pending",
    "manual_review",
    "approved",
    "rejected",
    "waitlisted",
  ];

  if (!registrationId || !validStatuses.includes(nextStatus)) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          selected: selected || undefined,
        },
        workspaceContext
      )
    );
  }

  if (
    (nextStatus === "rejected" || nextStatus === "manual_review") &&
    !adminNotes
  ) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          selected: selected || registrationId,
          notice: "note-required",
        },
        workspaceContext
      )
    );
  }

  if (adminNotes.length > 1000) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          selected: selected || registrationId,
          notice: "save-failed",
        },
        workspaceContext
      )
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: currentRegistration, error: registrationLookupError } =
    await supabase
      .from("registrations")
      .select(
        "id, registration_status, tournament_bracket_id, clerk_user_id, player_name, tournament_id, tournament_title, bracket_name"
      )
      .eq("id", registrationId)
      .maybeSingle();

  if (registrationLookupError || !currentRegistration) {
    console.error(
      "Registration status lookup error:",
      registrationLookupError?.message
    );
    redirect(
      buildHref(
        {
          filter: activeFilter,
          selected: selected || registrationId,
          notice: "save-failed",
        },
        workspaceContext
      )
    );
  }

  let rejectionEventKey: string | null = null;

  if (
    nextStatus === "rejected" &&
    currentRegistration.registration_status !== nextStatus &&
    currentRegistration.clerk_user_id
  ) {
    const { data: previousRejection, error: previousRejectionError } =
      await supabase
        .from("notifications")
        .select("id")
        .eq("recipient_clerk_user_id", currentRegistration.clerk_user_id)
        .eq("type", "registration.rejected")
        .eq("registration_id", currentRegistration.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (previousRejectionError) {
      console.error("Registration rejection notification lookup failed.");
      redirect(
        buildHref(
          {
            filter: activeFilter,
            selected: selected || registrationId,
            notice: "save-failed",
          },
          workspaceContext
        )
      );
    }

    const rejectionCycle = previousRejection
      ? `after:${previousRejection.id}`
      : "initial";
    rejectionEventKey =
      `registration:${currentRegistration.id}:rejected:${rejectionCycle}`;
  }

  const notification = buildRegistrationStatusNotification({
    previousStatus: currentRegistration.registration_status,
    nextStatus,
    registration: currentRegistration,
    actorClerkUserId: userId,
    rejectionEventKey,
  });

  const { error } = await supabase.rpc("review_tournament_registration", {
    p_registration_id: registrationId,
    p_registration_status: nextStatus,
    p_admin_notes: adminNotes || null,
  });

  if (error) {
    console.error("Supabase status update error:", error.message);
    const lowerMessage = error.message.toLowerCase();
    const notice: AdminNotice =
      lowerMessage.includes("capacity") ||
      lowerMessage.includes("bracket is full")
        ? "bracket-full"
        : lowerMessage.includes("launched") ||
            lowerMessage.includes("roster is locked")
          ? "registration-locked"
          : lowerMessage.includes("registration is not available")
            ? "registration-closed"
            : "save-failed";

    redirect(
      buildHref(
        {
          filter: activeFilter,
          selected: selected || registrationId,
          notice,
        },
        workspaceContext
      )
    );
  }

  if (notification) {
    await createInAppNotification(notification);
  }

  revalidateRegistrationPaths(workspaceContext);

  redirect(
    buildHref(
      {
        filter:
          !selected && nextStatus === "approved" ? "approved" : activeFilter,
        selected: selected || undefined,
        notice: "saved",
      },
      workspaceContext
    )
  );
}

export async function deleteSelectedRegistrations(formData: FormData) {
  "use server";

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  await requireCurrentAccountLegalAcceptance();

  const workspaceContext = getWorkspaceRedirectContext(formData);
  const activeFilter = getSafeFilter(
    String(formData.get("activeFilter") || "all")
  );
  const registrationIds = [
    ...new Set(
      formData
        .getAll("registrationId")
        .map((value) => String(value))
        .filter(isUuid)
    ),
  ].slice(0, 100);

  if (registrationIds.length === 0) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-delete-failed",
        },
        workspaceContext
      )
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: registrationsForDelete, error: lookupError } = await supabase
    .from("registrations")
    .select("id, registration_status, tournament_bracket_id")
    .in("id", registrationIds);

  if (
    lookupError ||
    !registrationsForDelete ||
    registrationsForDelete.length !== registrationIds.length
  ) {
    console.error("Registration delete lookup failed:", lookupError?.message);
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-delete-failed",
        },
        workspaceContext
      )
    );
  }

  const hasHistoricalRegistration = registrationsForDelete.some(
    (registration) =>
      registration.registration_status !== "rejected" &&
      registration.registration_status !== "withdrawn"
  );

  if (hasHistoricalRegistration) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-delete-blocked",
        },
        workspaceContext
      )
    );
  }

  const approvedBracketIds = [
    ...new Set(
      registrationsForDelete
        .filter(
          (registration) =>
            registration.registration_status === "approved" &&
            registration.tournament_bracket_id
        )
        .map((registration) => registration.tournament_bracket_id as string)
    ),
  ];

  const conflictQueries = [
    approvedBracketIds.length > 0
      ? supabase
          .from("generated_brackets")
          .select("id")
          .in("tournament_bracket_id", approvedBracketIds)
          .limit(1)
      : null,
    supabase
      .from("tournament_matches")
      .select("id")
      .in("player_one_registration_id", registrationIds)
      .limit(1),
    supabase
      .from("tournament_matches")
      .select("id")
      .in("player_two_registration_id", registrationIds)
      .limit(1),
    supabase
      .from("tournament_matches")
      .select("id")
      .in("winner_registration_id", registrationIds)
      .limit(1),
    supabase
      .from("tournament_standings")
      .select("registration_id")
      .in("registration_id", registrationIds)
      .limit(1),
    supabase
      .from("match_result_submissions")
      .select("id")
      .in("submitted_by_registration_id", registrationIds)
      .limit(1),
    supabase
      .from("match_result_submissions")
      .select("id")
      .in("claimed_winner_registration_id", registrationIds)
      .limit(1),
    supabase
      .from("match_result_report_groups")
      .select("id")
      .in("submitted_by_registration_id", registrationIds)
      .limit(1),
    supabase
      .from("match_result_report_groups")
      .select("id")
      .in("opponent_registration_id", registrationIds)
      .limit(1),
    supabase
      .from("match_result_report_groups")
      .select("id")
      .in("winner_registration_id", registrationIds)
      .limit(1),
  ].filter((query) => query !== null);

  const conflictResults = await Promise.all(conflictQueries);
  const conflictError = conflictResults.find((result) => result.error)?.error;
  const hasConflict = conflictResults.some(
    (result) => (result.data ?? []).length > 0
  );

  if (conflictError) {
    console.error("Registration delete conflict check failed:", conflictError);
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-delete-failed",
        },
        workspaceContext
      )
    );
  }

  if (hasConflict) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-delete-blocked",
        },
        workspaceContext
      )
    );
  }

  const { error } = await supabase
    .from("registrations")
    .delete()
    .in("id", registrationIds);

  if (error) {
    console.error("Registration delete failed:", error.message);
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-delete-failed",
        },
        workspaceContext
      )
    );
  }

  revalidateRegistrationPaths(workspaceContext, true);

  redirect(
    buildHref(
      {
        filter: activeFilter,
        notice: "registration-deleted",
      },
      workspaceContext
    )
  );
}

export async function approveSelectedRegistrations(formData: FormData) {
  "use server";

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  await requireCurrentAccountLegalAcceptance();

  const workspaceContext = getWorkspaceRedirectContext(formData);
  const activeFilter = getSafeFilter(
    String(formData.get("activeFilter") || "all")
  );
  const registrationIds = [
    ...new Set(
      formData
        .getAll("registrationId")
        .map((value) => String(value))
        .filter(isUuid)
    ),
  ].slice(0, 100);

  if (registrationIds.length === 0) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-bulk-failed",
          detail: "Select at least one registration to approve.",
        },
        workspaceContext
      )
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: registrationsForApproval, error: lookupError } = await supabase
    .from("registrations")
    .select(
      "id, player_name, registration_status, created_at, clerk_user_id, tournament_id, tournament_title, bracket_name"
    )
    .in("id", registrationIds);

  if (lookupError || !registrationsForApproval) {
    console.error("Registration bulk approval lookup failed:", lookupError);
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice: "registration-bulk-failed",
          detail: "Selected registrations could not be loaded.",
        },
        workspaceContext
      )
    );
  }

  const registrationsById = new Map(
    registrationsForApproval.map((registration) => [
      registration.id,
      registration,
    ])
  );
  const failures = registrationIds
    .filter((registrationId) => !registrationsById.has(registrationId))
    .map((registrationId) => `${registrationId}: registration not found`);
  const orderedRegistrations = [...registrationsForApproval].sort(
    (left, right) => {
      const leftTime = new Date(left.created_at ?? "").getTime();
      const rightTime = new Date(right.created_at ?? "").getTime();

      return (
        (Number.isFinite(leftTime) ? leftTime : 0) -
          (Number.isFinite(rightTime) ? rightTime : 0) ||
        left.id.localeCompare(right.id)
      );
    }
  );
  let approvedCount = 0;

  for (const registration of orderedRegistrations) {
    if (registration.registration_status === "approved") {
      failures.push(
        `${registration.player_name || registration.id}: registration is already approved`
      );
      continue;
    }

    if (registration.registration_status === "waitlisted") {
      failures.push(
        `${registration.player_name || registration.id}: the player must accept a FIFO spot offer before administrator approval`
      );
      continue;
    }

    if (registration.registration_status === "withdrawn") {
      failures.push(
        `${registration.player_name || registration.id}: withdrawal is final for this tournament`
      );
      continue;
    }

    if (registration.registration_status === "rejected") {
      failures.push(
        `${registration.player_name || registration.id}: rejected registrations require individual administrator review`
      );
      continue;
    }

    if (
      registration.registration_status !== "pending" &&
      registration.registration_status !== "manual_review"
    ) {
      failures.push(
        `${registration.player_name || registration.id}: registration is not eligible for bulk approval`
      );
      continue;
    }

    const { error } = await supabase.rpc("review_tournament_registration", {
      p_registration_id: registration.id,
      p_registration_status: "approved",
      p_admin_notes: null,
    });

    if (error) {
      failures.push(
        `${registration.player_name || registration.id}: ${describeRegistrationUpdateFailure(
          error.message
        )}`
      );
    } else {
      approvedCount += 1;
    }
  }

  revalidateRegistrationPaths(workspaceContext, true);

  if (failures.length > 0) {
    redirect(
      buildHref(
        {
          filter: activeFilter,
          notice:
            approvedCount > 0
              ? "registration-bulk-partial"
              : "registration-bulk-failed",
          detail: buildBulkApprovalDetail(failures, approvedCount),
        },
        workspaceContext
      )
    );
  }

  redirect(
    buildHref(
      {
        filter: "approved",
        notice: "registration-bulk-approved",
        detail: `${approvedCount} registration(s) approved.`,
      },
      workspaceContext
    )
  );
}

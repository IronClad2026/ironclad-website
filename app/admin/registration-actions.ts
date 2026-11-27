"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import {
  createInAppNotification,
  type NotificationCreateInput,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import type { AdminRegistrationStatus } from "@/lib/admin-registration-review";

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
  | "registration-bulk-failed"
  | "registration-scope-required"
  | "registration-scope-mismatch";
type WorkspaceSection = "registrations" | "players-waitlist";
type WorkspaceRedirectContext = {
  tournamentId: string;
  section: WorkspaceSection;
  page: number;
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
  ).trim().toLowerCase();
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
    page: /^\d+$/.test(String(formData.get("workspacePage") ?? "1")) &&
      Number.isSafeInteger(Number(formData.get("workspacePage") ?? 1)) &&
      Number(formData.get("workspacePage") ?? 1) > 0
      ? Number(formData.get("workspacePage") ?? 1) : 1,
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
    params.set("page", String(workspaceContext.page));
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

  const userId = await requireCurrentPatch2Admin();

  await requireCurrentAccountLegalAcceptance();

  const workspaceContext = getWorkspaceRedirectContext(formData);
  if (!workspaceContext) {
    redirect(buildHref({ filter: "all", notice: "registration-scope-required" }, null));
  }
  const registrationId = String(formData.get("registrationId") || "").trim().toLowerCase();
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
    "withdrawn",
  ];

  if (!isUuid(registrationId) || !validStatuses.includes(nextStatus)) {
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
      .eq("tournament_id", workspaceContext.tournamentId)
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
          notice: "registration-scope-mismatch",
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
        .eq("tournament_id", workspaceContext.tournamentId)
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

  const { error } = await supabase.rpc("review_tournament_registration_scoped_as_admin", {
    p_actor_clerk_user_id: userId,
    p_tournament_id: workspaceContext.tournamentId,
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

// Retain the exported action for already-open forms. Registration history is
// preserved; this workspace has no destructive registration-cleanup operation.
export async function deleteSelectedRegistrations(formData: FormData) {
  "use server";
  await requireCurrentPatch2Admin();
  await requireCurrentAccountLegalAcceptance();
  const workspaceContext = getWorkspaceRedirectContext(formData);
  redirect(buildHref({
    filter: getSafeFilter(String(formData.get("activeFilter") || "all")),
    notice: workspaceContext ? "registration-delete-blocked" : "registration-scope-required",
    detail: "Registration history cannot be deleted here. Open the tournament to review its registrations.",
  }, workspaceContext));
}

export async function approveSelectedRegistrations(formData: FormData) {
  "use server";
  const actorClerkUserId = await requireCurrentPatch2Admin();
  await requireCurrentAccountLegalAcceptance();
  const workspaceContext = getWorkspaceRedirectContext(formData);
  const activeFilter = getSafeFilter(String(formData.get("activeFilter") || "all"));
  if (!workspaceContext) {
    redirect(buildHref({ filter: activeFilter, notice: "registration-scope-required" }, null));
  }
  const submitted = formData.getAll("registrationId");
  if (submitted.length === 0 || submitted.length > 100 ||
      submitted.some((value) => typeof value !== "string" || !isUuid(value))) {
    redirect(buildHref({ filter: activeFilter, notice: "registration-bulk-failed",
      detail: "Select between 1 and 100 valid registrations from this tournament. Nothing was changed.",
    }, workspaceContext));
  }
  const registrationIds = [...new Set((submitted as string[]).map((id) => id.toLowerCase()))];
  const supabase = createSupabaseAdminClient();
  // Validate the complete selection before invoking any mutation. The RPC
  // repeats this validation under locks, including missing and foreign targets.
  const { data: registrations, error: lookupError } = await supabase
    .from("registrations")
    .select("id, player_name")
    .eq("tournament_id", workspaceContext.tournamentId)
    .in("id", registrationIds);
  if (lookupError || !registrations || registrations.length !== registrationIds.length) {
    redirect(buildHref({ filter: activeFilter, notice: "registration-scope-mismatch",
      detail: "The selection no longer belongs to this tournament. Reopen its registrations and select again. Nothing was changed.",
    }, workspaceContext));
  }
  const { data, error } = await supabase.rpc("approve_tournament_registrations_scoped_as_admin", {
    p_actor_clerk_user_id: actorClerkUserId,
    p_tournament_id: workspaceContext.tournamentId,
    p_registration_ids: registrationIds,
  });
  if (error || !Array.isArray(data) || data.length !== registrationIds.length ||
      new Set(data.map((row) => row.registration_id)).size !== registrationIds.length ||
      data.some((row) => !registrationIds.includes(row.registration_id) ||
        (row.error_message !== null && typeof row.error_message !== "string"))) {
    redirect(buildHref({ filter: activeFilter, notice: "registration-bulk-failed",
      detail: "The approval result could not be confirmed. Refresh this tournament before retrying.",
    }, workspaceContext));
  }
  const labels = new Map(registrations.map((row) => [row.id, row.player_name || row.id]));
  const failures: string[] = [];
  let approvedCount = 0;
  for (const row of data) {
    if (row.error_message === null) approvedCount += 1;
    else failures.push(`${labels.get(row.registration_id)}: ${describeRegistrationUpdateFailure(row.error_message)}`);
  }
  revalidateRegistrationPaths(workspaceContext, true);
  redirect(buildHref({
    filter: failures.length ? activeFilter : "approved",
    notice: failures.length
      ? approvedCount > 0 ? "registration-bulk-partial" : "registration-bulk-failed"
      : "registration-bulk-approved",
    detail: failures.length ? buildBulkApprovalDetail(failures, approvedCount)
      : `${approvedCount} registration(s) approved.`,
  }, workspaceContext));
}

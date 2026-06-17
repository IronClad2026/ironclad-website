import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  createInAppNotification,
  createInAppNotifications,
  loadAdminNotifications,
  type NotificationCreateInput,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import AdminRegistrationReviewRows, {
  type AdminRegistrationReviewRow,
} from "@/components/AdminRegistrationReviewRows";
import AdminRegistrationSelectAll from "@/components/AdminRegistrationSelectAll";
import AdminBracketManagement, {
  type AdminBracketTournamentOption,
} from "@/components/AdminBracketManagement";
import InAppNotificationCenter from "@/components/InAppNotificationCenter";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Trophy,
  X,
  XCircle,
} from "lucide-react";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type RegistrationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected"
  | "waitlisted";
type FilterStatus = "all" | RegistrationStatus;
type AdminFocusTarget = "note" | "reject" | "manual_review" | "waitlist";
type AdminNotice =
  | "note-required"
  | "saved"
  | "save-failed"
  | "bracket-preserved"
  | "registration-deleted"
  | "registration-delete-failed"
  | "registration-delete-blocked"
  | "waitlist-order-blocked"
  | "bracket-full"
  | "registration-closed"
  | "registration-locked"
  | "registration-bulk-approved"
  | "registration-bulk-partial"
  | "registration-bulk-failed";

type AdminPageProps = {
  searchParams?: Promise<{
    filter?: FilterStatus;
    selected?: string;
    notice?: AdminNotice;
    detail?: string;
    focus?: AdminFocusTarget;
    bracketNotice?: "population-saved" | "population-failed";
  }>;
};

type SupabaseRegistration = {
  id: string;
  player_name: string;
  clerk_user_id: string;
  discord_username: string;
  steam_name: string;
  country: string;
  region: string;
  timezone: string;
  submitted_elo: number;
  registration_status: RegistrationStatus;
  admin_notes: string | null;
  created_at: string;
  tournament_id: string | null;
  tournament_bracket_id: string | null;
  tournament_title: string | null;
  bracket_name: string | null;
  waitlist_position?: number | null;
  registration_order?: number | null;
};

type AdminTournamentOption = {
  id: string;
  title: string;
  status: string;
  grand_final_at: string | null;
  created_at: string;
  tournament_brackets?: { id: string; name: string; max_players: number }[];
};

const managementCards = [
  {
    title: "ELO Verification Queue",
    description: "Check player ELO before final admin approval.",
    icon: Search,
  },
];

function formatStatus(status: string) {
  return status
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSafeFilter(filter?: string): FilterStatus {
  const validFilters: FilterStatus[] = [
    "all",
    "pending",
    "manual_review",
    "approved",
    "rejected",
    "waitlisted",
  ];

  return validFilters.includes(filter as FilterStatus)
    ? (filter as FilterStatus)
    : "all";
}

function buildHref({
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
}) {
  const params = new URLSearchParams();
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

  return `/admin?${params.toString()}`;
}

function compareAdminTournaments(
  left: AdminTournamentOption,
  right: AdminTournamentOption
) {
  const leftHistorical = left.status === "completed" ? 1 : 0;
  const rightHistorical = right.status === "completed" ? 1 : 0;

  if (leftHistorical !== rightHistorical) {
    return leftHistorical - rightHistorical;
  }

  return getAdminTournamentSortTime(right) - getAdminTournamentSortTime(left);
}

function getAdminTournamentSortTime(tournament: AdminTournamentOption) {
  const dateValue = tournament.grand_final_at ?? tournament.created_at;
  const timestamp = new Date(dateValue).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareWaitlistedRegistrations(
  left: SupabaseRegistration,
  right: SupabaseRegistration
) {
  const leftTime = new Date(left.created_at).getTime();
  const rightTime = new Date(right.created_at).getTime();
  const timeDelta =
    (Number.isFinite(leftTime) ? leftTime : 0) -
    (Number.isFinite(rightTime) ? rightTime : 0);

  return timeDelta || left.id.localeCompare(right.id);
}

function buildWaitlistPositionMap(registrations: SupabaseRegistration[]) {
  const positions = new Map<string, number>();
  const byBracket = registrations.reduce((groups, registration) => {
    if (
      registration.registration_status !== "waitlisted" ||
      !registration.tournament_bracket_id
    ) {
      return groups;
    }

    const group = groups.get(registration.tournament_bracket_id) ?? [];
    group.push(registration);
    groups.set(registration.tournament_bracket_id, group);
    return groups;
  }, new Map<string, SupabaseRegistration[]>());

  for (const group of byBracket.values()) {
    group
      .slice()
      .sort(compareWaitlistedRegistrations)
      .forEach((registration, index) => {
        positions.set(registration.id, index + 1);
      });
  }

  return positions;
}

function buildRegistrationPriorityMap(registrations: SupabaseRegistration[]) {
  const priorities = new Map<string, number>();

  registrations
    .slice()
    .sort(compareWaitlistedRegistrations)
    .forEach((registration, index) => {
      priorities.set(registration.id, index + 1);
    });

  return priorities;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function describeRegistrationUpdateFailure(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("older waitlisted")) {
    return "older waitlisted players must be promoted first";
  }

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

  if (nextStatus === "approved") {
    const promoted = previousStatus === "waitlisted";
    return {
      ...base,
      type: promoted ? "registration.promoted" : "registration.approved",
      title: promoted ? "Promoted from Waitlist" : "Registration Approved",
      message: promoted
        ? `You have been promoted from the waitlist and are now an official participant in ${tournamentTitle}.`
        : `You have been approved for ${tournamentTitle}.`,
    };
  }

  if (nextStatus === "rejected") {
    return {
      ...base,
      type: "registration.rejected",
      title: "Registration Rejected",
      message: `Your registration for ${tournamentTitle} has been rejected.`,
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

async function updateRegistrationStatus(formData: FormData) {
  "use server";

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

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
      buildHref({
        filter: activeFilter,
        selected: selected || undefined,
      })
    );
  }

  if (
    (nextStatus === "rejected" || nextStatus === "manual_review") &&
    !adminNotes
  ) {
    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice: "note-required",
      })
    );
  }

  if (adminNotes.length > 1000) {
    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice: "save-failed",
      })
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
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice: "save-failed",
      })
    );
  }

  const approvedRosterChanged =
    currentRegistration.registration_status !== nextStatus &&
    (currentRegistration.registration_status === "approved" ||
      nextStatus === "approved");
  let bracketPreserved = false;

  if (
    approvedRosterChanged &&
    currentRegistration.tournament_bracket_id
  ) {
    const { data: regenerationSafe, error: safetyError } =
      await supabase.rpc("is_tournament_bracket_regeneration_safe", {
        p_tournament_bracket_id:
          currentRegistration.tournament_bracket_id,
      });

    if (safetyError) {
      console.error(
        "Bracket regeneration safety lookup failed:",
        safetyError.message
      );
    } else {
      bracketPreserved = regenerationSafe === false;
    }
  }

  const { error } = await supabase
    .from("registrations")
    .update({
      registration_status: nextStatus,
      admin_notes: adminNotes,
    })
    .eq("id", registrationId);

  if (error) {
    console.error("Supabase status update error:", error.message);
    const lowerMessage = error.message.toLowerCase();
    const notice: AdminNotice = lowerMessage.includes("older waitlisted")
      ? "waitlist-order-blocked"
      : lowerMessage.includes("bracket is full")
        ? "bracket-full"
        : lowerMessage.includes("roster is locked") ||
            lowerMessage.includes("bracket generation")
          ? "registration-locked"
        : lowerMessage.includes("registration is not available")
          ? "registration-closed"
          : "save-failed";

    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice,
      })
    );
  }

  const notification = buildRegistrationStatusNotification({
    previousStatus: currentRegistration.registration_status,
    nextStatus,
    registration: currentRegistration,
    actorClerkUserId: userId,
  });

  if (notification) {
    await createInAppNotification(notification);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");

  redirect(
    buildHref({
      filter: !selected && nextStatus === "approved" ? "approved" : activeFilter,
      selected: selected || undefined,
      notice: bracketPreserved ? "bracket-preserved" : "saved",
    })
  );
}

async function deleteSelectedRegistrations(formData: FormData) {
  "use server";

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

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
      buildHref({
        filter: activeFilter,
        notice: "registration-delete-failed",
      })
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
      buildHref({
        filter: activeFilter,
        notice: "registration-delete-failed",
      })
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
      buildHref({
        filter: activeFilter,
        notice: "registration-delete-failed",
      })
    );
  }

  if (hasConflict) {
    redirect(
      buildHref({
        filter: activeFilter,
        notice: "registration-delete-blocked",
      })
    );
  }

  const { error } = await supabase
    .from("registrations")
    .delete()
    .in("id", registrationIds);

  if (error) {
    console.error("Registration delete failed:", error.message);
    redirect(
      buildHref({
        filter: activeFilter,
        notice: "registration-delete-failed",
      })
    );
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");
  revalidatePath("/admin/tournaments");

  redirect(
    buildHref({
      filter: activeFilter,
      notice: "registration-deleted",
    })
  );
}

async function approveSelectedRegistrations(formData: FormData) {
  "use server";

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

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
      buildHref({
        filter: activeFilter,
        notice: "registration-bulk-failed",
        detail: "Select at least one registration to approve.",
      })
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
      buildHref({
        filter: activeFilter,
        notice: "registration-bulk-failed",
        detail: "Selected registrations could not be loaded.",
      })
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
  const approvalNotifications: NotificationCreateInput[] = [];

  for (const registration of orderedRegistrations) {
    if (registration.registration_status === "approved") {
      approvedCount += 1;
      continue;
    }

    const { error } = await supabase
      .from("registrations")
      .update({ registration_status: "approved" })
      .eq("id", registration.id);

    if (error) {
      failures.push(
        `${registration.player_name || registration.id}: ${describeRegistrationUpdateFailure(
          error.message
        )}`
      );
    } else {
      approvedCount += 1;
      const notification = buildRegistrationStatusNotification({
        previousStatus: registration.registration_status,
        nextStatus: "approved",
        registration,
        actorClerkUserId: userId,
      });

      if (notification) {
        approvalNotifications.push(notification);
      }
    }
  }

  if (approvalNotifications.length > 0) {
    await createInAppNotifications(approvalNotifications);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");
  revalidatePath("/admin/tournaments");

  if (failures.length > 0) {
    redirect(
      buildHref({
        filter: activeFilter,
        notice:
          approvedCount > 0
            ? "registration-bulk-partial"
            : "registration-bulk-failed",
        detail: buildBulkApprovalDetail(failures, approvedCount),
      })
    );
  }

  redirect(
    buildHref({
      filter: "approved",
      notice: "registration-bulk-approved",
      detail: `${approvedCount} registration(s) approved.`,
    })
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { userId, sessionClaims } = await auth();

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";

  if (!userId || !isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const activeFilter = getSafeFilter(params?.filter);

  const supabase = createSupabaseAdminClient();
  const [
    registrationResult,
    tournamentResult,
    generatedResult,
    adminNotifications,
  ] =
    await Promise.all([
      supabase
        .from("registrations")
        .select(
          "id, player_name, clerk_user_id, discord_username, steam_name, country, region, timezone, submitted_elo, registration_status, admin_notes, created_at, tournament_id, tournament_bracket_id, tournament_title, bracket_name"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("tournaments")
        .select(
          "id, title, status, grand_final_at, created_at, tournament_brackets(id, name, max_players)"
        )
        .order("grand_final_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("generated_brackets")
        .select(
          "id, tournament_bracket_id, format, slot_count, tournament_matches(player_one_slot, player_two_slot, player_one_registration_id, player_two_registration_id)"
        ),
      loadAdminNotifications(50),
    ]);
  const registrationsData = registrationResult.data;
  const error = registrationResult.error;

  if (error) {
    console.error("Supabase registrations fetch error:", error.message);
  }

  const baseRegistrations = (registrationsData ?? []) as SupabaseRegistration[];
  const registrationPriorityById =
    buildRegistrationPriorityMap(baseRegistrations);
  const tournaments = [
    ...((tournamentResult.data ?? []) as AdminTournamentOption[]),
  ].sort(compareAdminTournaments);
  const tournamentsById = new Map(
    tournaments.map((tournament) => [tournament.id, tournament.title])
  );
  const bracketMetaById = new Map(
    tournaments.flatMap((tournament) =>
      (tournament.tournament_brackets ?? []).map((bracket) => [
        bracket.id,
        {
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          bracketName: `${bracket.name} Bracket`,
          maxPlayers: bracket.max_players,
        },
      ])
    )
  );
  const approvedCountByBracket = new Map<string, number>();
  for (const registration of baseRegistrations) {
    if (
      registration.registration_status === "approved" &&
      registration.tournament_bracket_id
    ) {
      approvedCountByBracket.set(
        registration.tournament_bracket_id,
        (approvedCountByBracket.get(registration.tournament_bracket_id) ?? 0) +
          1
      );
    }
  }
  const waitlistPositionByRegistration =
    buildWaitlistPositionMap(baseRegistrations);
  const registrations = baseRegistrations.map((registration) => ({
    ...registration,
    waitlist_position: waitlistPositionByRegistration.get(registration.id) ?? null,
    registration_order: registrationPriorityById.get(registration.id) ?? 0,
  }));
  const waitlistNotices = registrations
    .filter(
      (registration) =>
        registration.registration_status === "waitlisted" &&
        registration.tournament_bracket_id
    )
    .slice()
    .sort(compareWaitlistedRegistrations)
    .slice(0, 6);
  const waitlistSlotNotices = Array.from(
    registrations
      .filter(
        (registration) =>
          registration.registration_status === "waitlisted" &&
          registration.tournament_bracket_id
      )
      .reduce((groups, registration) => {
        const bracketId = registration.tournament_bracket_id as string;
        const group = groups.get(bracketId) ?? [];
        group.push(registration);
        groups.set(bracketId, group);
        return groups;
      }, new Map<string, SupabaseRegistration[]>())
  )
    .map(([bracketId, waitlisted]) => {
      const meta = bracketMetaById.get(bracketId);
      const approvedCount = approvedCountByBracket.get(bracketId) ?? 0;
      const openSlots = Math.max((meta?.maxPlayers ?? 0) - approvedCount, 0);
      const nextPlayer = waitlisted.slice().sort(compareWaitlistedRegistrations)[0];
      return meta && openSlots > 0 && nextPlayer
        ? { bracketId, meta, openSlots, nextPlayer }
        : null;
    })
    .filter((notice) => notice !== null);
  const generatedByBracket = new Map(
    (
      (generatedResult.data ?? []) as {
        id: string;
        tournament_bracket_id: string;
        format: "single_elimination" | "round_robin";
        slot_count: number;
        tournament_matches?: {
          player_one_slot: number | null;
          player_two_slot: number | null;
          player_one_registration_id: string | null;
          player_two_registration_id: string | null;
        }[];
      }[]
    ).map((generated) => [generated.tournament_bracket_id, generated])
  );
  const bracketManagementTournaments: AdminBracketTournamentOption[] =
    tournaments
      .map((tournament) => ({
        id: tournament.id,
        title: tournament.title,
        brackets: (tournament.tournament_brackets ?? [])
          .map((bracket) => {
            const generated = generatedByBracket.get(bracket.id);
            const assignments: Record<number, string | null> = {};
            for (const match of generated?.tournament_matches ?? []) {
              if (match.player_one_slot) {
                assignments[match.player_one_slot] =
                  match.player_one_registration_id;
              }
              if (match.player_two_slot) {
                assignments[match.player_two_slot] =
                  match.player_two_registration_id;
              }
            }

            return {
              generatedBracketId: generated?.id ?? null,
              bracketId: bracket.id,
              bracketName: `${bracket.name} Bracket`,
              format: generated?.format ?? null,
              slotCount: generated?.slot_count ?? 0,
              actualMatchCount: generated?.tournament_matches?.length ?? 0,
              expectedMatchCount: generated
                ? generated.format === "single_elimination"
                  ? generated.slot_count - 1
                  : (generated.slot_count * (generated.slot_count - 1)) / 2
                : 0,
              assignments,
              participants: registrations
                .filter(
                  (registration) =>
                    registration.registration_status === "approved" &&
                    registration.tournament_id === tournament.id &&
                    registration.tournament_bracket_id === bracket.id
                )
                .map((registration) => ({
                  id: registration.id,
                  name: registration.player_name,
                  country: registration.country || "N/A",
                  elo: registration.submitted_elo ?? 0,
                })),
            };
          }),
      }))
      .filter((tournament) => tournament.brackets.length > 0);

  if (tournamentResult.error) {
    console.error(
      "Admin tournament operations load failed:",
      tournamentResult.error.message
    );
  }

  if (generatedResult.error) {
    console.error(
      "Admin generated brackets load failed:",
      generatedResult.error.message
    );
  }

  const selectedRegistration = registrations.find(
    (registration) => registration.id === params?.selected
  );

  const filteredRegistrations =
    activeFilter === "all"
      ? registrations
      : registrations.filter(
          (registration) => registration.registration_status === activeFilter
        );
  const registrationReviewRows: AdminRegistrationReviewRow[] =
    filteredRegistrations.map((registration) => ({
      id: registration.id,
      playerName: registration.player_name,
      tournamentName:
        registration.tournament_title ||
        (registration.tournament_id
          ? tournamentsById.get(registration.tournament_id) ?? ""
          : ""),
      bracketName: registration.bracket_name,
      createdAt: registration.created_at,
      region: registration.region,
      submittedElo: registration.submitted_elo,
      country: registration.country,
      discordUsername: registration.discord_username,
      status: registration.registration_status || "pending",
      adminNotes: registration.admin_notes,
      waitlistPosition: registration.waitlist_position ?? null,
      registrationOrder: registration.registration_order ?? 0,
    }));

  const stats = [
    {
      label: "Pending Registrations",
      value: registrations.filter(
        (item) => item.registration_status === "pending"
      ).length,
      filter: "pending" as FilterStatus,
      icon: Clock,
    },
    {
      label: "Manual Reviews",
      value: registrations.filter(
        (item) => item.registration_status === "manual_review"
      ).length,
      filter: "manual_review" as FilterStatus,
      icon: ShieldAlert,
    },
    {
      label: "Approved Players",
      value: registrations.filter(
        (item) => item.registration_status === "approved"
      ).length,
      filter: "approved" as FilterStatus,
      icon: CheckCircle,
    },
    {
      label: "Rejected Players",
      value: registrations.filter(
        (item) => item.registration_status === "rejected"
      ).length,
      filter: "rejected" as FilterStatus,
      icon: XCircle,
    },
    {
      label: "Waitlisted Players",
      value: registrations.filter(
        (item) => item.registration_status === "waitlisted"
      ).length,
      filter: "waitlisted" as FilterStatus,
      icon: Clock,
    },
    {
      label: "Active Tournaments",
      value: tournaments.filter(
        (tournament) =>
          tournament.status === "registration_open" ||
          tournament.status === "in_progress"
      ).length,
      filter: "all" as FilterStatus,
      icon: Trophy,
    },
  ];

  return (
    <main className="min-h-screen bg-black px-6 pt-32 pb-16 text-white">
      <section className="mx-auto max-w-7xl space-y-8">
        <div
          className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-8 shadow-2xl"
          style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/75" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-orange-950/40" />

          <div className="relative z-10 max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
              Private Admin Area
            </p>

            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
              IronClad Admin Command Center
            </h1>

            <p className="mt-5 max-w-3xl text-zinc-300">
              Control registrations, ELO checks, approvals, player verification,
              and the full IronClad tournament workflow.
            </p>
            <Link
              href="/admin/tournaments"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white transition hover:bg-orange-400"
            >
              <Trophy className="h-4 w-4" />
              Create Or Manage Tournaments
            </Link>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => {
            const Icon = stat.icon;
            const isActive =
              activeFilter === stat.filter && stat.filter !== "all";

            return (
              <Link
                key={stat.label}
                href={buildHref({ filter: stat.filter })}
                className={`rounded-2xl border p-5 backdrop-blur transition hover:-translate-y-1 ${
                  isActive
                    ? "border-orange-400 bg-orange-500/20 shadow-lg shadow-orange-500/10"
                    : "border-white/10 bg-white/[0.04] hover:border-orange-500/60 hover:bg-orange-500/10"
                }`}
              >
                <Icon className="h-6 w-6 text-orange-400" />
                <p className="mt-4 text-3xl font-bold">{stat.value}</p>
                <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
              </Link>
            );
          })}
        </div>

        <div className="relative z-10 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Registration Review</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Showing {filteredRegistrations.length} registration(s).
              </p>
            </div>

            <form
              id="registration-bulk-form"
              action={deleteSelectedRegistrations}
            >
              <input type="hidden" name="activeFilter" value={activeFilter} />
            </form>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                form="registration-bulk-form"
                formAction={approveSelectedRegistrations}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-green-200 transition hover:border-green-400/60 hover:bg-green-500/20"
              >
                <CheckCircle className="h-4 w-4" />
                Approve Selected
              </button>
              <button
                type="submit"
                form="registration-bulk-form"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-red-200 transition hover:border-red-400/60 hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected
              </button>
            </div>
          </div>

          {params?.notice === "registration-deleted" && (
            <div className="mb-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm font-semibold text-green-300">
              Selected registration(s) deleted.
            </div>
          )}

          {params?.notice === "registration-bulk-approved" && (
            <div className="mb-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm font-semibold text-green-300">
              {params.detail || "Selected registration(s) approved."}
            </div>
          )}

          {params?.notice === "registration-bulk-partial" && (
            <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-200">
              {params.detail ||
                "Some selected registration(s) were approved. Others failed validation."}
            </div>
          )}

          {params?.notice === "registration-bulk-failed" && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold leading-6 text-red-300">
              {params.detail ||
                "Selected registration(s) could not be approved."}
            </div>
          )}

          {params?.notice === "registration-delete-blocked" && (
            <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm font-semibold leading-6 text-orange-200">
              Selected registration(s) are tied to generated bracket data,
              matches, standings, submissions, or report groups. Reset or
              remove the related tournament data before deleting them.
            </div>
          )}

          {params?.notice === "registration-delete-failed" && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-300">
              Registration deletion failed. Select at least one registration and
              confirm the selected records are not protected by active
              tournament data.
            </div>
          )}

          {params?.notice === "waitlist-order-blocked" && (
            <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-200">
              Waitlist promotion blocked. Promote the oldest waitlisted player
              for this bracket first, unless you explicitly change the queue.
            </div>
          )}

          {params?.notice === "bracket-full" && (
            <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold leading-6 text-amber-200">
              Approval blocked because the bracket is already at approved
              capacity.
            </div>
          )}

          {params?.notice === "registration-closed" && (
            <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm font-semibold leading-6 text-orange-200">
              Registration update blocked because this tournament is no longer
              open for roster changes. Set the tournament back to registration
              open before making waitlist promotions.
            </div>
          )}

          {params?.notice === "registration-locked" && (
            <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm font-semibold leading-6 text-orange-200">
              Waitlist promotion blocked because this bracket has already been
              generated or the tournament is live. Use the protected bracket
              management workflow for post-generation roster corrections.
            </div>
          )}

          {(waitlistNotices.length > 0 || waitlistSlotNotices.length > 0) && (
            <div className="mb-5 grid gap-3 lg:grid-cols-2">
              {waitlistNotices.length > 0 && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Waitlist Activity
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-amber-50/90">
                    {waitlistNotices.map((registration) => (
                      <p key={registration.id}>
                        {registration.player_name || "Player"} joined Waitlist
                        Position #{registration.waitlist_position ?? "?"} for{" "}
                        {registration.tournament_title ||
                          (registration.tournament_id
                            ? tournamentsById.get(registration.tournament_id)
                            : null) ||
                          "this tournament"}
                        .
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {waitlistSlotNotices.length > 0 && (
                <div className="rounded-2xl border border-green-500/25 bg-green-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-green-300">
                    Slot Available
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-green-50/90">
                    {waitlistSlotNotices.map((notice) => (
                      <p key={notice.bracketId}>
                        {notice.openSlots} slot
                        {notice.openSlots === 1 ? "" : "s"} available in{" "}
                        {notice.meta.tournamentTitle} -{" "}
                        {notice.meta.bracketName}. Next queued player:{" "}
                        {notice.nextPlayer.player_name || "Player"} at
                        Waitlist Position #
                        {notice.nextPlayer.waitlist_position ?? "?"}.
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[1220px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-4">
                    <AdminRegistrationSelectAll
                      formId="registration-bulk-form"
                      name="registrationId"
                    />
                  </th>
                  <th>Player Name</th>
                  <th>Tournament Name</th>
                  <th>Created</th>
                  <th>Region</th>
                  <th>ELO</th>
                  <th>Country</th>
                  <th>Discord</th>
                  <th>Registration Status</th>
                  <th>Waitlist</th>
                </tr>
              </thead>

              <AdminRegistrationReviewRows
                registrations={registrationReviewRows}
                activeFilter={activeFilter}
                formId="registration-bulk-form"
                updateRegistrationStatusAction={updateRegistrationStatus}
              />
            </table>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              Could not load registrations from Supabase. Check your table name,
              column names, and Row Level Security policy.
            </div>
          )}
        </div>

        <div className="relative z-0 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <AdminBracketManagement
            tournaments={bracketManagementTournaments}
            notice={params?.bracketNotice}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <InAppNotificationCenter
              key={[
                adminNotifications.unreadCount,
                ...adminNotifications.notifications.map(
                  (notification) =>
                    `${notification.id}:${notification.readAt ?? ""}`
                ),
              ].join("|")}
              scope="admin"
              title="Admin Notification Center"
              description="Recent registration, match result, and dispute events that need administrative awareness."
              emptyMessage="New registrations, submitted results, and disputes will appear here."
              notifications={adminNotifications.notifications}
              totalCount={adminNotifications.totalCount}
              unreadCount={adminNotifications.unreadCount}
              error={adminNotifications.error}
              className="sm:col-span-2"
            />

            {managementCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-orange-500/60 hover:bg-orange-500/10"
                >
                  <Icon className="h-8 w-8 text-orange-400" />

                  <h3 className="mt-5 text-xl font-bold">{card.title}</h3>

                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {card.description}
                  </p>

                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-orange-300">
                    Preview module
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selectedRegistration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur">
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-orange-500/30 bg-zinc-950 p-6 shadow-2xl shadow-orange-950/40">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-400">
                  Registration Details
                </p>

                <h2 className="mt-3 text-3xl font-bold">
                  {selectedRegistration.player_name || "N/A"}
                </h2>

                <p className="mt-2 text-sm text-zinc-400">
                  Full player registration review and admin decision panel.
                </p>
              </div>

              <Link
                href={buildHref({ filter: activeFilter })}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                <X className="h-5 w-5" />
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Player Name", selectedRegistration.player_name],
                ["Discord", selectedRegistration.discord_username],
                ["Steam Name", selectedRegistration.steam_name],
                ["Country", selectedRegistration.country],
                ["Region", selectedRegistration.region],
                ["Timezone", selectedRegistration.timezone],
                ["Submitted ELO", selectedRegistration.submitted_elo],
                [
                  "Registration Status",
                  formatStatus(
                    selectedRegistration.registration_status || "pending"
                  ),
                ],
                [
                  "Waitlist Position",
                  selectedRegistration.registration_status === "waitlisted"
                    ? `#${selectedRegistration.waitlist_position ?? "?"}`
                    : "N/A",
                ],
                [
                  "Created At",
                  selectedRegistration.created_at
                    ? new Date(selectedRegistration.created_at).toLocaleString()
                    : "N/A",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {label}
                  </p>

                  <p className="mt-2 font-semibold text-white">
                    {value || "N/A"}
                  </p>
                </div>
              ))}
            </div>

            <form action={updateRegistrationStatus} className="mt-4">
              <input
                type="hidden"
                name="registrationId"
                value={selectedRegistration.id}
              />
              <input
                type="hidden"
                name="activeFilter"
                value={activeFilter}
              />
              <input
                type="hidden"
                name="selected"
                value={selectedRegistration.id}
              />

              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
                <label
                  htmlFor="adminNotes"
                  className="text-xs font-bold uppercase tracking-wider text-orange-300"
                >
                  Admin Notes
                </label>
                <p className="mt-2 text-xs leading-5 text-zinc-400">
                  Required when rejecting a registration or marking it for
                  manual review. This note is shown to the player.
                </p>
                <textarea
                  id="adminNotes"
                  name="adminNotes"
                  defaultValue={selectedRegistration.admin_notes ?? ""}
                  maxLength={1000}
                  rows={5}
                  autoFocus={
                    params?.focus === "note" || params?.focus === "reject"
                  }
                  className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400"
                  placeholder="Explain the decision or information needed from the player."
                />
              </div>

              {params?.notice && (
                <div
                  className={`mt-4 rounded-xl border p-4 text-sm ${
                    params.notice === "saved" ||
                    params.notice === "bracket-preserved"
                      ? "border-green-500/30 bg-green-500/10 text-green-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {params.notice === "note-required"
                    ? "Add an admin note before rejecting or marking this registration for manual review."
                    : params.notice === "saved"
                      ? "Registration decision and admin note saved."
                      : params.notice === "bracket-preserved"
                        ? "Registration saved. The populated or active bracket was preserved and was not regenerated. Use an explicit administrator reset before rebuilding it."
                        : params.notice === "registration-locked"
                          ? "This bracket has already been generated or the tournament is live. Use the protected bracket management workflow for roster corrections."
                          : "The registration decision could not be saved. Check the note length and try again."}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  name="nextStatus"
                  value={selectedRegistration.registration_status || "pending"}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.08]"
                >
                  Save Note
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="approved"
                  className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 transition hover:bg-green-500/20"
                >
                  <CheckCircle className="h-4 w-4" />
                  {selectedRegistration.registration_status === "waitlisted"
                    ? "Approve From Waitlist"
                    : "Approve"}
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="rejected"
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="manual_review"
                  autoFocus={params?.focus === "manual_review"}
                  className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Mark Manual Review
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="waitlisted"
                  autoFocus={params?.focus === "waitlist"}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
                >
                  <Clock className="h-4 w-4" />
                  Waitlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

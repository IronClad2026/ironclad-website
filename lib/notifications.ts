import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type NotificationScope = "player" | "admin";

export type InAppNotification = {
  id: string;
  recipientRole: NotificationScope | null;
  type: string;
  title: string;
  message: string;
  actorDisplayName: string | null;
  tournamentId: string | null;
  tournamentTitle: string | null;
  registrationId: string | null;
  matchId: string | null;
  reportGroupId: string | null;
  deadlineAt: string | null;
  readAt: string | null;
  createdAt: string;
  href: string | null;
};

export type NotificationLoadResult = {
  notifications: InAppNotification[];
  totalCount: number;
  unreadCount: number;
  error: string | null;
};

export type NotificationCreateInput = {
  recipientClerkUserId?: string | null;
  recipientRole?: NotificationScope | null;
  type: string;
  title: string;
  message: string;
  actorClerkUserId?: string | null;
  actorDisplayName?: string | null;
  tournamentId?: string | null;
  tournamentTitle?: string | null;
  registrationId?: string | null;
  matchId?: string | null;
  reportGroupId?: string | null;
  eventKey?: string | null;
  metadata?: Record<string, unknown>;
};

type NotificationRow = {
  id: string;
  recipient_role: NotificationScope | null;
  type: string;
  title: string;
  message: string;
  actor_display_name: string | null;
  tournament_id: string | null;
  tournament_title: string | null;
  registration_id: string | null;
  match_id: string | null;
  report_group_id: string | null;
  event_key: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const NOTIFICATION_SELECT =
  "id, recipient_role, type, title, message, actor_display_name, tournament_id, tournament_title, registration_id, match_id, report_group_id, event_key, metadata, read_at, created_at";

export async function createInAppNotification(
  input: NotificationCreateInput
): Promise<boolean> {
  const recipientClerkUserId = input.recipientClerkUserId?.trim() || null;
  const recipientRole = input.recipientRole ?? null;

  if (!recipientClerkUserId && !recipientRole) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("notifications").insert({
    recipient_clerk_user_id: recipientClerkUserId,
    recipient_role: recipientRole,
    type: input.type,
    title: input.title,
    message: input.message,
    actor_clerk_user_id: input.actorClerkUserId ?? null,
    actor_display_name: input.actorDisplayName ?? null,
    tournament_id: input.tournamentId ?? null,
    tournament_title: input.tournamentTitle ?? null,
    registration_id: input.registrationId ?? null,
    match_id: input.matchId ?? null,
    report_group_id: input.reportGroupId ?? null,
    event_key: input.eventKey ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    logNotificationFailure("create-one", error);
    return false;
  }

  return true;
}

export async function createInAppNotifications(
  inputs: NotificationCreateInput[]
): Promise<boolean> {
  const rows = inputs
    .map((input) => ({
      recipient_clerk_user_id: input.recipientClerkUserId?.trim() || null,
      recipient_role: input.recipientRole ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      actor_clerk_user_id: input.actorClerkUserId ?? null,
      actor_display_name: input.actorDisplayName ?? null,
      tournament_id: input.tournamentId ?? null,
      tournament_title: input.tournamentTitle ?? null,
      registration_id: input.registrationId ?? null,
      match_id: input.matchId ?? null,
      report_group_id: input.reportGroupId ?? null,
      event_key: input.eventKey ?? null,
      metadata: input.metadata ?? {},
    }))
    .filter(
      (row) => row.recipient_clerk_user_id !== null || row.recipient_role !== null
    );

  if (rows.length === 0) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    logNotificationFailure("create-many", error);
    return false;
  }

  return true;
}

export async function loadPlayerNotifications(
  clerkUserId: string,
  limit = 8
): Promise<NotificationLoadResult> {
  const supabase = createSupabaseAdminClient();
  const [notificationResult, totalResult, unreadResult] = await Promise.all([
    supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("recipient_clerk_user_id", clerkUserId)
      .is("in_app_hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_clerk_user_id", clerkUserId)
      .is("in_app_hidden_at", null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_clerk_user_id", clerkUserId)
      .is("in_app_hidden_at", null)
      .is("read_at", null),
  ]);

  if (notificationResult.error || totalResult.error || unreadResult.error) {
    logNotificationFailure(
      "load-player",
      notificationResult.error ?? totalResult.error ?? unreadResult.error
    );
    return {
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      error: "Notifications could not be loaded.",
    };
  }

  return {
    notifications: ((notificationResult.data ?? []) as NotificationRow[]).map(
      (notification) => mapNotification(notification, "player")
    ),
    totalCount: totalResult.count ?? 0,
    unreadCount: unreadResult.count ?? 0,
    error: null,
  };
}

export async function loadAdminNotifications(
  limit = 8
): Promise<NotificationLoadResult> {
  const supabase = createSupabaseAdminClient();
  const [notificationResult, totalResult, unreadResult] = await Promise.all([
    supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("recipient_role", "admin")
      .is("in_app_hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_role", "admin")
      .is("in_app_hidden_at", null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_role", "admin")
      .is("in_app_hidden_at", null)
      .is("read_at", null),
  ]);

  if (notificationResult.error || totalResult.error || unreadResult.error) {
    logNotificationFailure(
      "load-admin",
      notificationResult.error ?? totalResult.error ?? unreadResult.error
    );
    return {
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      error: "Notifications could not be loaded.",
    };
  }

  return {
    notifications: ((notificationResult.data ?? []) as NotificationRow[]).map(
      (notification) => mapNotification(notification, "admin")
    ),
    totalCount: totalResult.count ?? 0,
    unreadCount: unreadResult.count ?? 0,
    error: null,
  };
}

export async function markNotificationRead({
  notificationId,
  scope,
  clerkUserId,
}: {
  notificationId: string;
  scope: NotificationScope;
  clerkUserId?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);

  if (scope === "admin") {
    query.eq("recipient_role", "admin");
  } else {
    query.eq("recipient_clerk_user_id", clerkUserId ?? "");
  }

  const { error } = await query;

  if (error) {
    logNotificationFailure("mark-one-read", error);
    return false;
  }

  return true;
}

export async function markNotificationsRead({
  notificationIds,
  scope,
  clerkUserId,
}: {
  notificationIds: string[];
  scope: NotificationScope;
  clerkUserId?: string | null;
}) {
  const ids = [...new Set(notificationIds)].filter(Boolean).slice(0, 100);

  if (ids.length === 0) {
    return true;
  }

  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);

  if (scope === "admin") {
    query.eq("recipient_role", "admin");
  } else {
    query.eq("recipient_clerk_user_id", clerkUserId ?? "");
  }

  const { error } = await query;

  if (error) {
    logNotificationFailure("mark-many-read", error);
    return false;
  }

  return true;
}

export async function markAllNotificationsRead({
  scope,
  clerkUserId,
}: {
  scope: NotificationScope;
  clerkUserId?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (scope === "admin") {
    query.eq("recipient_role", "admin");
  } else {
    query.eq("recipient_clerk_user_id", clerkUserId ?? "");
  }

  const { error } = await query;

  if (error) {
    logNotificationFailure("mark-all-read", error);
    return false;
  }

  return true;
}

export async function deleteNotifications({
  notificationIds,
  scope,
  clerkUserId,
}: {
  notificationIds: string[];
  scope: NotificationScope;
  clerkUserId?: string | null;
}) {
  const ids = [...new Set(notificationIds)].filter(Boolean).slice(0, 100);

  if (ids.length === 0) {
    return true;
  }

  const supabase = createSupabaseAdminClient();
  const hiddenAt = new Date().toISOString();
  const canonicalQuery = supabase
    .from("notifications")
    .update({ in_app_hidden_at: hiddenAt })
    .in("id", ids)
    .not("event_key", "is", null);

  const legacyQuery = supabase
    .from("notifications")
    .delete()
    .in("id", ids)
    .is("event_key", null);

  if (scope === "admin") {
    canonicalQuery.eq("recipient_role", "admin");
    legacyQuery.eq("recipient_role", "admin");
  } else {
    canonicalQuery.eq("recipient_clerk_user_id", clerkUserId ?? "");
    legacyQuery.eq("recipient_clerk_user_id", clerkUserId ?? "");
  }

  const [{ error: canonicalError }, { error: legacyError }] =
    await Promise.all([canonicalQuery, legacyQuery]);

  if (canonicalError || legacyError) {
    logNotificationFailure("delete", canonicalError ?? legacyError);
    return false;
  }

  return true;
}

function mapNotification(
  row: NotificationRow,
  scope: NotificationScope
): InAppNotification {
  return {
    id: row.id,
    recipientRole: row.recipient_role,
    type: row.type,
    title: row.title,
    message: row.message,
    actorDisplayName: row.actor_display_name,
    tournamentId: row.tournament_id,
    tournamentTitle: row.tournament_title,
    registrationId: row.registration_id,
    matchId: row.match_id,
    reportGroupId: row.report_group_id,
    deadlineAt: getPublicDeadlineAt(row.type, row.metadata),
    readAt: row.read_at,
    createdAt: row.created_at,
    href: buildNotificationHref(row, scope),
  };
}

function logNotificationFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "NOTIFY_FAILED";

  console.error("Notification operation failed.", { operation, code });
}

function buildNotificationHref(
  row: NotificationRow,
  scope: NotificationScope
): string | null {
  if (scope === "admin") {
    if (row.match_id) {
      return buildMatchHref(row);
    }

    if (row.registration_id) {
      return `/admin?filter=all&selected=${encodeURIComponent(
        row.registration_id
      )}`;
    }

    if (row.tournament_id || row.report_group_id) {
      return row.tournament_id
        ? `/tournaments?tournament=${encodeURIComponent(row.tournament_id)}`
        : "/tournaments";
    }

    return "/admin";
  }

  if (
    row.registration_id &&
    (row.type === "registration.waitlist_offer" ||
      row.type === "registration.waitlist_closed")
  ) {
    return `/dashboard#registration-${encodeURIComponent(row.registration_id)}`;
  }

  if (row.match_id) {
    return buildMatchHref(row);
  }

  if (row.tournament_id || row.report_group_id) {
    return row.tournament_id
      ? `/tournaments?tournament=${encodeURIComponent(row.tournament_id)}`
      : "/tournaments";
  }

  return "/dashboard";
}

function buildMatchHref(row: NotificationRow) {
  const params = new URLSearchParams();

  if (row.tournament_id) {
    params.set("tournament", row.tournament_id);
  }
  params.set("tab", "brackets");
  params.set("match", row.match_id ?? "");

  return `/tournaments?${params.toString()}`;
}

function getPublicDeadlineAt(
  type: string,
  metadata: Record<string, unknown> | null
) {
  if (type === "match.deadline_updated" && metadata?.updateKind === "hold") {
    return null;
  }

  const value = metadata?.deadlineAt;

  if (typeof value !== "string") return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? value : null;
}

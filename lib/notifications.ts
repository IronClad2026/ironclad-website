import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type NotificationScope = "player" | "admin";

export type InAppNotification = {
  id: string;
  recipientClerkUserId: string | null;
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
  metadata: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
};

type NotificationRow = {
  id: string;
  recipient_clerk_user_id: string | null;
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
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const NOTIFICATION_SELECT =
  "id, recipient_clerk_user_id, recipient_role, type, title, message, actor_display_name, tournament_id, tournament_title, registration_id, match_id, report_group_id, metadata, read_at, created_at";

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
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("Notification creation failed:", error.message);
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
    console.error("Bulk notification creation failed:", error.message);
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
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_clerk_user_id", clerkUserId),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_clerk_user_id", clerkUserId)
      .is("read_at", null),
  ]);

  if (notificationResult.error || totalResult.error || unreadResult.error) {
    const error =
      notificationResult.error?.message ??
      totalResult.error?.message ??
      unreadResult.error?.message ??
      "Notifications could not be loaded.";
    console.error("Player notifications load failed:", error);
    return { notifications: [], totalCount: 0, unreadCount: 0, error };
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
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_role", "admin"),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_role", "admin")
      .is("read_at", null),
  ]);

  if (notificationResult.error || totalResult.error || unreadResult.error) {
    const error =
      notificationResult.error?.message ??
      totalResult.error?.message ??
      unreadResult.error?.message ??
      "Notifications could not be loaded.";
    console.error("Admin notifications load failed:", error);
    return { notifications: [], totalCount: 0, unreadCount: 0, error };
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
    console.error("Notification mark-read failed:", error.message);
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
    console.error("Notification mark-all-read failed:", error.message);
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
    console.error("Notification mark-all-read failed:", error.message);
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
  const query = supabase.from("notifications").delete().in("id", ids);

  if (scope === "admin") {
    query.eq("recipient_role", "admin");
  } else {
    query.eq("recipient_clerk_user_id", clerkUserId ?? "");
  }

  const { error } = await query;

  if (error) {
    console.error("Notification delete failed:", error.message);
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
    recipientClerkUserId: row.recipient_clerk_user_id,
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
    metadata: row.metadata ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
    href: buildNotificationHref(row, scope),
  };
}

function buildNotificationHref(
  row: NotificationRow,
  scope: NotificationScope
): string | null {
  if (scope === "admin") {
    if (row.registration_id) {
      return `/admin?filter=all&selected=${encodeURIComponent(
        row.registration_id
      )}`;
    }

    if (row.match_id || row.tournament_id || row.report_group_id) {
      return "/tournaments";
    }

    return "/admin";
  }

  if (row.tournament_id || row.match_id || row.report_group_id) {
    return "/tournaments";
  }

  return "/dashboard";
}

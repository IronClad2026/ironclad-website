import "server-only";

import type { Locale } from "@/lib/i18n/config";
import type { NotificationsDictionary } from "@/lib/i18n/dictionaries/en/notifications";
import { loadDictionary } from "@/lib/i18n/loaders";
import { localizePlayerNotificationCopy } from "@/lib/i18n/notification-copy";
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
  const eventKey = input.eventKey?.trim() || null;

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
    event_key: eventKey,
    metadata: input.metadata ?? {},
  });

  if (error) {
    if (eventKey && isDuplicateNotificationEvent(error)) {
      return true;
    }

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
  limit = 8,
  locale: Locale = "en"
): Promise<NotificationLoadResult> {
  const supabase = createSupabaseAdminClient();
  const [notificationResult, totalResult, unreadResult, dictionary] = await Promise.all([
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
    loadDictionary(locale, "notifications"),
  ]);

  const loadError =
    notificationResult.error ?? totalResult.error ?? unreadResult.error;
  const counts = getValidNotificationCounts(
    totalResult.count,
    unreadResult.count
  );
  const invalidResponse =
    !Array.isArray(notificationResult.data) || counts === null;

  if (loadError || invalidResponse) {
    logNotificationFailure(
      "load-player",
      loadError ?? { code: "INVALID_RESPONSE" }
    );
    return {
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      error: dictionary.server.loadError,
    };
  }

  return {
    notifications: (notificationResult.data as NotificationRow[]).map(
      (notification) => mapNotification(notification, "player", dictionary)
    ),
    totalCount: counts.totalCount,
    unreadCount: counts.unreadCount,
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

  const loadError =
    notificationResult.error ?? totalResult.error ?? unreadResult.error;
  const counts = getValidNotificationCounts(
    totalResult.count,
    unreadResult.count
  );
  const invalidResponse =
    !Array.isArray(notificationResult.data) || counts === null;

  if (loadError || invalidResponse) {
    logNotificationFailure(
      "load-admin",
      loadError ?? { code: "INVALID_RESPONSE" }
    );
    return {
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      error: "Notifications could not be loaded.",
    };
  }

  return {
    notifications: (notificationResult.data as NotificationRow[]).map(
      (notification) => mapNotification(notification, "admin")
    ),
    totalCount: counts.totalCount,
    unreadCount: counts.unreadCount,
    error: null,
  };
}

function getValidNotificationCounts(total: unknown, unread: unknown) {
  if (
    !Number.isSafeInteger(total) ||
    Number(total) < 0 ||
    !Number.isSafeInteger(unread) ||
    Number(unread) < 0 ||
    Number(unread) > Number(total)
  ) {
    return null;
  }

  return {
    totalCount: Number(total),
    unreadCount: Number(unread),
  };
}

export async function loadUnreadNotificationCount({
  scope,
  clerkUserId,
}: {
  scope: NotificationScope;
  clerkUserId?: string | null;
}): Promise<number | null> {
  if (scope === "player" && !clerkUserId) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("in_app_hidden_at", null)
    .is("read_at", null);

  if (scope === "admin") {
    query.eq("recipient_role", "admin");
  } else {
    query.eq("recipient_clerk_user_id", clerkUserId);
  }

  const { count, error } = await query;

  if (error || count === null) {
    logNotificationFailure("load-unread-count", error);
    return null;
  }

  return count;
}

export async function resolveNotificationDestination(
  notificationId: string,
  scope: NotificationScope,
  clerkUserId?: string | null
): Promise<string | null> {
  if (
    !isUuid(notificationId) ||
    (scope === "player" && !clerkUserId?.trim())
  ) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("id", notificationId);

  if (scope === "admin") {
    query.eq("recipient_role", "admin");
  } else {
    query.eq("recipient_clerk_user_id", clerkUserId?.trim() ?? "");
  }

  const { data, error } = await query.maybeSingle();
  if (error || !isNotificationDestinationRow(data)) {
    if (error) logNotificationFailure("resolve-destination", error);
    return null;
  }

  return buildNotificationHref(data, scope);
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
  scope: NotificationScope,
  dictionary?: NotificationsDictionary
): InAppNotification {
  const localizedCopy =
    scope === "player" && dictionary
      ? localizePlayerNotificationCopy(
          { type: row.type, tournamentTitle: row.tournament_title },
          dictionary
        )
      : null;

  return {
    id: row.id,
    recipientRole: row.recipient_role,
    type: row.type,
    title: localizedCopy?.title ?? row.title,
    message: localizedCopy?.message ?? row.message,
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

function isDuplicateNotificationEvent(error: unknown) {
  return Boolean(
    typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
  );
}

function isNotificationDestinationRow(
  value: unknown
): value is NotificationRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.type === "string" &&
    isNullableString(row.recipient_role) &&
    isNullableString(row.tournament_id) &&
    isNullableString(row.registration_id) &&
    isNullableString(row.match_id) &&
    isNullableString(row.report_group_id) &&
    (row.metadata === null || isRecord(row.metadata))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function buildNotificationHref(
  row: NotificationRow,
  scope: NotificationScope
): string | null {
  const pollHref = buildPollNotificationHref(row);
  if (pollHref) {
    return pollHref;
  }

  if (scope === "admin") {
    if (row.match_id) {
      return buildMatchHref(row);
    }

    if (row.registration_id) {
      return `/admin/registrations?filter=all&selected=${encodeURIComponent(
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
    (row.type === "registration.approved" ||
      row.type === "registration.waitlist_offer" ||
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

function buildPollNotificationHref(row: NotificationRow) {
  if (
    row.type !== "poll.published" &&
    row.type !== "poll.decision_published"
  ) {
    return null;
  }

  const pollId = readPollId(row.metadata);
  if (row.tournament_id) {
    const params = new URLSearchParams({
      tournament: row.tournament_id,
      tab: "decisions",
    });
    if (pollId) params.set("poll", pollId);
    return `/tournaments?${params.toString()}`;
  }

  return "/dashboard#community-polls";
}

function readPollId(metadata: Record<string, unknown> | null) {
  const value = metadata?.pollId;
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
    ? value
    : null;
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

  const value =
    type === "registration.waitlist_offer"
      ? metadata?.offerExpiresAt
      : metadata?.deadlineAt;

  if (typeof value !== "string") return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? value : null;
}

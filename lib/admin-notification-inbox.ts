import "server-only";

import { mapNotification, type InAppNotification, type NotificationRow } from "@/lib/notifications";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type AdminInboxScope =
  | { kind: "tournament"; tournamentId: string }
  | { kind: "platform" }
  | { kind: "unassigned" };

export type AdminInboxData = {
  scope: AdminInboxScope;
  notifications: InAppNotification[];
  totalCount: number;
  unreadCount: number;
  filteredCount: number;
  page: number;
  pageCount: number;
  filter: "all" | "unread";
  selectedNotification: InAppNotification | null;
};

export type AdminInboxOptions = {
  page?: string | number;
  filter?: string;
  selected?: string;
};

const PAGE_SIZE = 25;
const MAX_PAGE = 2_147_483_647;
const UNAVAILABLE = "The Admin inbox could not be loaded. Please try again.";

export function isAdminNotificationInboxEnabled(): boolean {
  return process.env.PATCH2_ADMIN_INBOX_ENABLED === "true";
}

/** Every entry point using service-role inbox RPCs verifies current admin authority. */
export async function requireAdminNotificationInbox(): Promise<string> {
  try {
    return await requireCurrentPatch2Admin();
  } catch {
    throw new Error("Administrator access is required.");
  }
}

export function normalizeAdminInboxScope(scope: AdminInboxScope): AdminInboxScope {
  if (!isRecord(scope)) throw new Error("Choose an Admin inbox scope.");
  if (scope.kind === "tournament" && Object.keys(scope).length === 2 && isUuid(scope.tournamentId)) {
    return { kind: "tournament", tournamentId: scope.tournamentId.toLowerCase() };
  }
  if ((scope.kind === "platform" || scope.kind === "unassigned") && Object.keys(scope).length === 1) {
    return { kind: scope.kind };
  }
  throw new Error("Choose a valid tournament or Admin inbox scope.");
}

export function normalizeAdminInboxOptions(options: AdminInboxOptions = {}) {
  if (!isRecord(options)) throw new Error("The inbox view is invalid.");
  const pageInput = options.page ?? 1;
  const page = typeof pageInput === "number" ? pageInput :
    typeof pageInput === "string" && /^\d+$/.test(pageInput) ? Number(pageInput) : NaN;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new Error("Choose a valid inbox page.");
  }
  const filter = options.filter ?? "all";
  if (filter !== "all" && filter !== "unread") throw new Error("Choose a valid inbox filter.");
  const selected = options.selected;
  if (selected !== undefined && !isUuid(selected)) throw new Error("The selected notification is invalid.");
  return { page, filter, selected: selected?.toLowerCase() } as const;
}

export function isAdminInboxNotificationId(value: unknown): value is string {
  return isUuid(value);
}

export async function loadAdminNotificationInbox(
  scopeInput: AdminInboxScope,
  options: AdminInboxOptions = {}
): Promise<AdminInboxData> {
  const actorClerkUserId = await requireAdminNotificationInbox();
  if (!isAdminNotificationInboxEnabled()) {
    throw new Error("The scoped Admin inbox is currently disabled. Please try again later.");
  }
  const scope = normalizeAdminInboxScope(scopeInput);
  const query = normalizeAdminInboxOptions(options);
  let payload: unknown;
  try {
    const result = await createSupabaseAdminClient().rpc("read_admin_notification_inbox_as_admin", {
      p_actor_clerk_user_id: actorClerkUserId,
      p_scope: scope.kind,
      p_tournament_id: scope.kind === "tournament" ? scope.tournamentId : null,
      p_page: query.page,
      p_unread_only: query.filter === "unread",
      p_selected_id: query.selected ?? null,
    });
    if (result.error) throw new Error(UNAVAILABLE);
    payload = result.data;
  } catch {
    throw new Error(UNAVAILABLE);
  }

  if (!isRecord(payload) || !Array.isArray(payload.notifications) ||
    !isCount(payload.totalCount) || !isCount(payload.unreadCount) ||
    !isCount(payload.filteredCount) || !isCount(payload.page) || !isCount(payload.pageCount) ||
    payload.unreadCount > payload.totalCount ||
    payload.filteredCount !== (query.filter === "unread" ? payload.unreadCount : payload.totalCount) ||
    payload.pageCount !== Math.max(1, Math.ceil(payload.filteredCount / PAGE_SIZE)) ||
    payload.page < 1 || payload.page !== Math.min(query.page, payload.pageCount) ||
    payload.notifications.length !== Math.min(PAGE_SIZE, payload.filteredCount - (payload.page - 1) * PAGE_SIZE)) {
    throw new Error(UNAVAILABLE);
  }

  const rows = payload.notifications.map((row) => parseAdminNotification(row, scope));
  if (rows.some((row) => row === null || (query.filter === "unread" && row.read_at !== null))) throw new Error(UNAVAILABLE);
  const notifications = (rows as NotificationRow[]).map((row) => mapNotification(row, "admin"));
  if (new Set(notifications.map((row) => row.id)).size !== notifications.length) throw new Error(UNAVAILABLE);

  let selectedNotification: InAppNotification | null = null;
  if (payload.selectedNotification !== null) {
    const selected = parseAdminNotification(payload.selectedNotification, scope);
    if (!selected || !query.selected || selected.id !== query.selected) throw new Error(UNAVAILABLE);
    selectedNotification = mapNotification(selected, "admin");
  }

  return {
    scope, notifications,
    totalCount: payload.totalCount, unreadCount: payload.unreadCount,
    filteredCount: payload.filteredCount, page: payload.page, pageCount: payload.pageCount,
    filter: query.filter, selectedNotification,
  };
}

function parseAdminNotification(value: unknown, scope: AdminInboxScope): NotificationRow | null {
  if (!isRecord(value) || !isUuid(value.id) || value.recipient_role !== "admin" ||
    typeof value.type !== "string" || typeof value.title !== "string" || typeof value.message !== "string" ||
    typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at)) ||
    !isNullableText(value.actor_display_name) || !isNullableText(value.tournament_title) ||
    !isNullableText(value.registration_id) || !isNullableText(value.match_id) ||
    !isNullableText(value.report_group_id) || !isNullableText(value.event_key) ||
    !isNullableText(value.read_at) ||
    (value.read_at !== null && !Number.isFinite(Date.parse(value.read_at))) ||
    (value.tournament_id !== null && !isUuid(value.tournament_id)) ||
    (value.metadata !== null && !isRecord(value.metadata)) ||
    (Object.hasOwn(value, "in_app_hidden_at") && value.in_app_hidden_at !== null)) return null;

  const metadata = value.metadata as Record<string, unknown> | null;
  if (scope.kind === "tournament") {
    if (value.tournament_id !== scope.tournamentId) return null;
  } else if (value.tournament_id !== null ||
    (scope.kind === "platform") !== (metadata?.adminInboxScope === "platform")) return null;

  return {
    id: value.id, recipient_role: "admin", type: value.type, title: value.title, message: value.message,
    actor_display_name: value.actor_display_name, tournament_id: value.tournament_id,
    tournament_title: value.tournament_title, registration_id: value.registration_id,
    match_id: value.match_id, report_group_id: value.report_group_id,
    event_key: value.event_key, metadata, read_at: value.read_at, created_at: value.created_at,
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

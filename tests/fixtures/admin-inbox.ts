export const ADMIN_INBOX_TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_ADMIN_INBOX_TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";
export const ADMIN_INBOX_NOTIFICATION_ID = "abcdef12-abcd-4abc-8abc-abcdef123456";

export function adminInboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ADMIN_INBOX_NOTIFICATION_ID,
    recipient_role: "admin", type: "registration.created", title: "Registration received",
    message: "Review this registration.", actor_display_name: "Player",
    tournament_id: ADMIN_INBOX_TOURNAMENT_ID, tournament_title: "Original Cup",
    registration_id: "33333333-3333-4333-8333-333333333333", match_id: null,
    report_group_id: null, event_key: null, metadata: {}, read_at: null,
    created_at: "2026-11-02T00:00:00.000Z", in_app_hidden_at: null,
    ...overrides,
  };
}

export function adminInboxSnapshot(
  notifications = [adminInboxRow()],
  overrides: Record<string, unknown> = {}
) {
  return {
    notifications, totalCount: notifications.length,
    unreadCount: notifications.filter((row) => row.read_at === null).length,
    filteredCount: notifications.length, page: 1, pageCount: 1,
    selectedNotification: null, ...overrides,
  };
}

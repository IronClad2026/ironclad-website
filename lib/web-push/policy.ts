import "server-only";

export const ADMIN_WEB_PUSH_TYPES = [
  "match.dispute_opened",
  "match.no_show_disputed",
  "match.admin_assistance_requested",
] as const;

export const PLAYER_WEB_PUSH_TYPES = [
  "registration.approved",
  "registration.rejected",
  "registration.waitlist_offer",
  "registration.waitlist_closed",
  "tournament.cancelled",
  "tournament.voided",
  "match.ready",
  "match.automatic_advance",
  "match.deadline_updated",
  "match.deadline_reminder",
  "match.deadline_ruling",
  "match.confirmation_required",
  "match.no_show_reported",
  "match.no_show_confirmed",
  "match.no_show_disputed",
  "match.no_show_approved",
  "match.no_show_rejected",
  "match.no_show_review_required",
  "match.result_approved",
  "match.result_review_required",
  "poll.published",
  "poll.decision_published",
] as const;

const ADMIN_TYPE_SET = new Set<string>(ADMIN_WEB_PUSH_TYPES);
const PLAYER_TYPE_SET = new Set<string>(PLAYER_WEB_PUSH_TYPES);

export type WebPushEligibilityInput = {
  recipientRole: string;
  recipientClerkUserId: string | null;
  type: string;
  eventKey: string;
  metadata: Record<string, unknown>;
};

export function isWebPushEligible(
  input: WebPushEligibilityInput
): boolean {
  if (!input.eventKey.trim()) return false;

  if (input.recipientRole === "admin") {
    return (
      input.recipientClerkUserId === null &&
      ADMIN_TYPE_SET.has(input.type)
    );
  }

  if (
    input.recipientRole !== "player" ||
    !input.recipientClerkUserId?.trim() ||
    !PLAYER_TYPE_SET.has(input.type)
  ) {
    return false;
  }

  return (
    input.type !== "poll.published" ||
    input.metadata.purpose === "tournament_decision"
  );
}

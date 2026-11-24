import type { DashboardNotification } from "@/lib/player-dashboard";
import type { PlayerTournamentDivisionInvitation } from "@/lib/tournament-division-invitations";
import type { PlayerRegistration } from "./registration-presentation";

export type CompetitionSection = "matches" | "registrations" | "invitations";
type MatchAttention = Pick<DashboardNotification, "canConfirm" | "canDispute" | "status" | "confirmationDeadlineAt">;
type RegistrationOffer = Pick<PlayerRegistration, "id" | "waitlist_offer_status" | "waitlist_offer_expires_at" | "launched_at">;

export function requiresMatchAttention(notification: MatchAttention) {
  return notification.canConfirm || notification.canDispute ||
    notification.status === "rejected" || notification.status === "resubmission_requested";
}

function deadlineAt(value: string | null, now: number) {
  const time = Date.parse(value ?? "");
  return time > now ? time : Infinity;
}

export function compareMatchAttention(left: MatchAttention, right: MatchAttention, now: number) {
  const attention = Number(requiresMatchAttention(right)) - Number(requiresMatchAttention(left));
  if (attention || !requiresMatchAttention(left)) return attention;
  const leftDeadline = deadlineAt(left.confirmationDeadlineAt, now);
  const rightDeadline = deadlineAt(right.confirmationDeadlineAt, now);
  return leftDeadline === rightDeadline ? 0 : leftDeadline - rightDeadline;
}

// This influences presentation only. The existing cards still control which actions are available.
export function getCompetitionPriority(
  notifications: readonly MatchAttention[],
  registrations: readonly RegistrationOffer[],
  invitations: readonly Pick<PlayerTournamentDivisionInvitation, "status">[],
  now = Date.now(),
): { section: CompetitionSection; registrationId?: string } | null {
  const matches = notifications.filter(requiresMatchAttention)
    .sort((left, right) => compareMatchAttention(left, right, now));
  const offers = registrations.filter(registration =>
    registration.waitlist_offer_status === "offered" && !registration.launched_at &&
    (!registration.waitlist_offer_expires_at || Date.parse(registration.waitlist_offer_expires_at) > now),
  );
  const earliestOffer = offers.reduce<RegistrationOffer | undefined>((earliest, offer) =>
    !earliest || deadlineAt(offer.waitlist_offer_expires_at, now) < deadlineAt(earliest.waitlist_offer_expires_at, now)
      ? offer : earliest, undefined);
  if (earliestOffer && (!matches.length ||
    deadlineAt(earliestOffer.waitlist_offer_expires_at, now) < deadlineAt(matches[0].confirmationDeadlineAt, now))) {
    return { section: "registrations", registrationId: earliestOffer.id };
  }
  if (matches.length) return { section: "matches" };
  if (invitations.some(invitation => invitation.status === "pending" || invitation.status === "accepted")) {
    return { section: "invitations" };
  }
  return null;
}

import type { TournamentStatus } from "@/lib/tournaments";

export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "manual_review"
  | "waitlisted"
  | "withdrawn";

type WaitlistOfferStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | null;

export type PlayerRegistration = {
  id: string;
  tournament_title: string;
  bracket_name: string;
  registration_status: RegistrationStatus;
  tournament_bracket_id: string;
  elo_status: string;
  submitted_elo: number | null;
  withdrawn_at: string | null;
  waitlist_offer_status: WaitlistOfferStatus;
  waitlist_offer_created_at: string | null;
  waitlist_offer_expires_at: string | null;
  waitlist_offer_resolved_at: string | null;
  launched_at: string | null;
  tournament_status: TournamentStatus;
  created_at: string;
};


/**
 * Presentation buckets only. Never use this grouping to enable an action.
 * Keep offers and ambiguous completed records visible; the existing action
 * component remains responsible for its current availability presentation.
 */
export function groupDashboardRegistrations<T extends Pick<PlayerRegistration,
  "tournament_status" | "registration_status" | "waitlist_offer_status" | "launched_at"
>>(registrations: readonly T[]): { current: T[]; previous: T[] } {
  const current: T[] = [];
  const previous: T[] = [];
  for (const registration of registrations) {
    const closedEvent = registration.tournament_status === "cancelled" ||
      registration.tournament_status === "voided";
    const offered = registration.waitlist_offer_status === "offered";
    const finishedEvent = registration.tournament_status === "completed" &&
      registration.launched_at !== null;
    const closedRegistration = registration.registration_status === "withdrawn" ||
      registration.registration_status === "rejected";
    if (closedEvent || (!offered && (finishedEvent || closedRegistration))) {
      previous.push(registration);
    } else {
      current.push(registration);
    }
  }
  // Stable within each group; existing source order is otherwise preserved.
  current.sort((left, right) =>
    Number(right.waitlist_offer_status === "offered") -
    Number(left.waitlist_offer_status === "offered")
  );
  return { current, previous };
}

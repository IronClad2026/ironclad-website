import type { DashboardNotification } from "@/lib/player-dashboard";
import { getTournamentRegistrationAvailability, type TournamentStatus } from "@/lib/tournaments";
import type { PlayerRegistration } from "./registration-presentation";

export const DASHBOARD_RESULT_REVIEW_EVENT = "ironclad:review-dashboard-result";

export type DashboardOverviewTournament = {
  id: string;
  slug: string;
  title: string;
  bannerImageUrl: string | null;
  status: TournamentStatus;
  registrationEnabled: boolean;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  startDate: string | null;
  brackets: { id: string; launchedAt: string | null; notHeld: boolean }[];
};

export type DashboardOverviewEventModel = {
  kind: "result" | "registration" | "entry" | "spectate";
  title: string;
  eyebrow: string;
  description: string;
  bannerImageUrl: string | null;
  deadline: string | null;
  deadlineLabel: string;
  action: { label: string } & (
    | { kind: "review"; notificationId: string }
    | { kind: "link"; href: string }
  );
};

type ReviewableResult = Pick<DashboardNotification,
  "canConfirm" | "canDispute" | "status" | "confirmationDeadlineAt" | "finalizedAt">;

/** Presentation only: the existing authenticated actions re-check all permissions. */
export function isDashboardResultReviewable(notification: ReviewableResult, now = Date.now()) {
  return (notification.canConfirm || notification.canDispute) &&
    notification.status === "pending_confirmation" && notification.finalizedAt === null &&
    Date.parse(notification.confirmationDeadlineAt ?? "") > now;
}

function eventHref(event: DashboardOverviewTournament, params: Record<string, string> = {}) {
  return "/tournaments?" + new URLSearchParams({ tournament: event.slug, ...params }).toString();
}

function activeEvent(event: DashboardOverviewTournament) {
  return event.status !== "completed" && event.status !== "cancelled" && event.status !== "voided";
}

function futureDeadline(value: string | null, now: number) {
  const timestamp = Date.parse(value ?? "");
  return timestamp > now ? timestamp : Infinity;
}

function registrationWindowOpen(event: DashboardOverviewTournament, now: number) {
  return activeEvent(event) && getTournamentRegistrationAvailability({
    statusValue: event.status, registrationEnabled: event.registrationEnabled,
    registrationOpenAt: event.registrationOpenAt, registrationCloseAt: event.registrationCloseAt,
  }, now) === "open";
}

function hasLiveOffer(registration: PlayerRegistration, now: number) {
  return registration.waitlist_offer_status === "offered" && !registration.launched_at &&
    futureDeadline(registration.waitlist_offer_expires_at, now) !== Infinity;
}

export function buildDashboardOverviewEvent({
  notifications,
  registrations,
  events,
  profileCompleted,
  now = Date.now(),
}: {
  notifications: readonly DashboardNotification[];
  registrations: readonly PlayerRegistration[];
  events: readonly DashboardOverviewTournament[];
  profileCompleted: boolean;
  now?: number;
}): DashboardOverviewEventModel | null {
  const review = notifications.filter(notification => isDashboardResultReviewable(notification, now))
    .sort((left, right) => Date.parse(left.confirmationDeadlineAt!) - Date.parse(right.confirmationDeadlineAt!))[0];
  if (review) {
    // Legacy notification records lack an event ID. Only use artwork on an unambiguous exact title match.
    const matchingEvents = events.filter(event => event.title === review.tournamentName && activeEvent(event));
    return {
      kind: "result",
      title: review.tournamentName,
      eyebrow: "Match action",
      description: review.resultType === "no_show" ? "No-show report awaiting your review" : "Match result awaiting your review",
      bannerImageUrl: matchingEvents.length === 1 ? matchingEvents[0].bannerImageUrl : null,
      deadline: review.confirmationDeadlineAt,
      deadlineLabel: "Review by",
      action: {
        kind: "review", notificationId: review.id,
        label: review.resultType === "no_show" ? "Review no-show" : "Review result",
      },
    };
  }

  const current = registrations.filter(registration => {
    if (["completed", "cancelled", "voided"].includes(registration.tournament_status) ||
      registration.registration_status === "withdrawn" || registration.registration_status === "rejected") return false;
    if (hasLiveOffer(registration, now)) return true;
    const event = events.find(event => event.brackets.some(bracket => bracket.id === registration.tournament_bracket_id));
    return event ? activeEvent(event) && (event.status === "in_progress" || registrationWindowOpen(event, now)) :
      registration.tournament_status === "in_progress";
  }).sort((left, right) => {
    const leftOffer = hasLiveOffer(left, now);
    const rightOffer = hasLiveOffer(right, now);
    if (leftOffer !== rightOffer) return Number(rightOffer) - Number(leftOffer);
    if (leftOffer && rightOffer) return futureDeadline(left.waitlist_offer_expires_at, now) -
      futureDeadline(right.waitlist_offer_expires_at, now);
    return Number(right.tournament_status === "in_progress") - Number(left.tournament_status === "in_progress");
  });
  if (current.length) {
    const registration = current[0];
    const event = events.find(event => event.brackets.some(bracket => bracket.id === registration.tournament_bracket_id));
    const offer = hasLiveOffer(registration, now);
    const descriptions = {
      approved: "Your registration is approved",
      pending: "Your registration is awaiting review",
      manual_review: "Your registration needs manual review",
      waitlisted: "You are on the waitlist",
      rejected: "Your registration was not approved",
      withdrawn: "Your registration was withdrawn",
    };
    return {
      kind: "registration", title: registration.tournament_title,
      eyebrow: `${registration.tournament_status === "in_progress" ? "Live tournament" : "Your tournament"} · ${registration.bracket_name}`,
      description: offer ? "A waitlist place is ready for your review" :
        registration.waitlist_offer_status === "accepted" &&
          (registration.registration_status === "pending" || registration.registration_status === "manual_review") ?
          "Your accepted waitlist place is awaiting review" :
          descriptions[registration.registration_status],
      bannerImageUrl: event?.bannerImageUrl ?? null,
      deadline: offer ? registration.waitlist_offer_expires_at : event && registrationWindowOpen(event, now) &&
        futureDeadline(event.registrationCloseAt, now) !== Infinity ? event.registrationCloseAt : null,
      deadlineLabel: offer ? "Offer expires" : "Registration closes",
      action: { kind: "link", label: offer ? "Review available place" : "View registration", href: `#registration-${registration.id}` },
    };
  }

  const available = events.filter(activeEvent);
  const open = available.find(event => registrationWindowOpen(event, now) &&
    event.brackets.some(bracket => !bracket.launchedAt && !bracket.notHeld));
  if (open) return {
    kind: "entry", title: open.title, eyebrow: "Registration open",
    description: profileCompleted ? "Check your current division and entry requirements" : "Complete your player profile before entering",
    bannerImageUrl: open.bannerImageUrl,
    deadline: Number.isFinite(Date.parse(open.registrationCloseAt ?? "")) ? open.registrationCloseAt : null,
    deadlineLabel: "Registration closes",
    action: { kind: "link", label: profileCompleted ? "Check eligibility" : "Complete profile", href: profileCompleted ? eventHref(open, { register: "1" }) : "/profile" },
  };

  const live = available.find(event => event.status === "in_progress" && event.brackets.some(bracket => bracket.launchedAt));
  if (live) return {
    kind: "spectate", title: live.title, eyebrow: "Live tournament",
    description: "Follow the live brackets and official results",
    bannerImageUrl: live.bannerImageUrl, deadline: null, deadlineLabel: "",
    action: { kind: "link", label: "View tournament", href: eventHref(live, { tab: "brackets" }) },
  };
  return null;
}

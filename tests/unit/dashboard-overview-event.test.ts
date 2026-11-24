import { describe, expect, it } from "vitest";
import { buildDashboardOverviewEvent, isDashboardResultReviewable, type DashboardOverviewTournament } from "@/components/dashboard/overview-event-presentation";
import type { PlayerRegistration } from "@/components/dashboard/registration-presentation";
import type { DashboardNotification } from "@/lib/player-dashboard";

const now = Date.parse("2026-11-24T08:00:00Z");
const later = "2026-11-24T10:00:00Z";
const event: DashboardOverviewTournament = {
  id: "event", slug: "hold-the-line", title: "Hold the Line", bannerImageUrl: "/event.webp",
  status: "registration_open", registrationEnabled: true, registrationOpenAt: null,
  registrationCloseAt: later, startDate: null,
  brackets: [{ id: "academy", launchedAt: null, notHeld: false }],
};
const registration: PlayerRegistration = {
  id: "registration", tournament_title: event.title, bracket_name: "Academy",
  tournament_bracket_id: "academy", registration_status: "approved", elo_status: "verified",
  submitted_elo: 1000, withdrawn_at: null, waitlist_offer_status: null,
  waitlist_offer_created_at: null, waitlist_offer_expires_at: null,
  waitlist_offer_resolved_at: null, launched_at: null,
  tournament_status: "registration_open", created_at: "2026-11-20T00:00:00Z",
};
const notification: DashboardNotification = {
  id: "report_group:report", source: "report_group", sourceId: "report", reportGroupId: "report",
  resultType: "normal", noShowRegistrationId: null, noShowStatus: null,
  submissionNumber: 1, gameNumber: 1, tournamentName: event.title, roundName: "Final",
  matchNumber: 1, opponentName: "Opponent", reportedWinner: "Player", reportedLoser: "Opponent",
  reportedScore: "2-1", status: "pending_confirmation", reviewNotes: null,
  submittedAt: "2026-11-24T07:00:00Z", reviewedAt: null, submittedByViewer: false,
  confirmationDeadlineAt: later, finalizedAt: null, canConfirm: true, canDispute: true,
};
const select = (overrides: Partial<Parameters<typeof buildDashboardOverviewEvent>[0]> = {}) =>
  buildDashboardOverviewEvent({ notifications: [], registrations: [], events: [event], profileCompleted: true, now, ...overrides });

describe("Dashboard next tournament action", () => {
  it("puts the earliest actionable result or no-show ahead of registration offers and event entry", () => {
    const imminent = { ...notification, id: "no-show", resultType: "no_show" as const, confirmationDeadlineAt: "2026-11-24T08:30:00Z" };
    const model = select({ notifications: [notification, imminent], registrations: [{ ...registration, waitlist_offer_status: "offered", waitlist_offer_expires_at: "2026-11-24T08:10:00Z" }] });
    expect(model?.action).toEqual({ kind: "review", notificationId: "no-show", label: "Review no-show" });
    expect(model?.deadline).toBe(imminent.confirmationDeadlineAt);
  });

  it("does not offer review for expired, finalized or unauthorized results", () => {
    for (const row of [
      { ...notification, canConfirm: false, canDispute: false },
      { ...notification, confirmationDeadlineAt: "2026-11-24T07:59:00Z" },
      { ...notification, finalizedAt: "2026-11-24T07:58:00Z" },
      { ...notification, status: "confirmed" as const },
    ]) {
      expect(isDashboardResultReviewable(row, now)).toBe(false);
      expect(select({ notifications: [row] })?.kind).toBe("entry");
    }
  });

  it("opens the registered tournament without starting a new entry", () => {
    const model = select({ registrations: [registration] });
    expect(model?.kind).toBe("registration");
    expect(model?.action).toEqual({ kind: "link", label: "View tournament", href: "/tournaments?tournament=hold-the-line" });
    expect(model?.deadline).toBe(later);
    expect(model?.deadlineLabel).toBe("Registration closes");
  });

  it("uses the recorded unexpired waitlist deadline without turning an expired offer into an active offer", () => {
    const offer = { ...registration, registration_status: "waitlisted" as const, waitlist_offer_status: "offered" as const, waitlist_offer_expires_at: later };
    expect(select({ registrations: [offer] })?.deadline).toBe(later);
    expect(select({ registrations: [offer] })?.action).toEqual({ kind: "link", label: "Review available place", href: "#registration-registration" });
    expect(select({ registrations: [{ ...offer, waitlist_offer_expires_at: "2026-11-23T00:00:00Z" }] })?.deadlineLabel).toBe("Registration closes");
  });

  it("keeps the registration reachable if the live tournament cannot be resolved", () => {
    const model = select({ events: [], registrations: [{ ...registration, tournament_status: "in_progress" }] });
    expect(model?.action).toEqual({ kind: "link", label: "View registration", href: "#registration-registration" });
  });

  it("describes accepted waitlist review only while pending or in manual review", () => {
    expect(select({ registrations: [{ ...registration, registration_status: "pending", waitlist_offer_status: "accepted" }] })?.description)
      .toBe("Your accepted waitlist place is awaiting review");
    expect(select({ registrations: [{ ...registration, registration_status: "manual_review", waitlist_offer_status: "accepted" }] })?.description)
      .toBe("Your accepted waitlist place is awaiting review");
    expect(select({ registrations: [{ ...registration, waitlist_offer_status: "accepted" }] })?.description)
      .toBe("Your registration is approved");
  });

  it("preserves the real registration workflow without claiming the player is eligible", () => {
    expect(select()?.action).toEqual({ kind: "link", label: "Check eligibility", href: "/tournaments?tournament=hold-the-line&register=1" });
    expect(select({ profileCompleted: false })?.action).toEqual({ kind: "link", label: "Complete profile", href: "/profile" });
  });

  it("does not offer entry into closed, disabled, launched or Not Held divisions", () => {
    const closedCases = [
      { ...event, registrationEnabled: false },
      { ...event, registrationCloseAt: "2026-11-23T00:00:00Z" },
      { ...event, registrationOpenAt: "2026-11-25T00:00:00Z" },
      { ...event, brackets: [{ ...event.brackets[0], launchedAt: "2026-11-23T00:00:00Z" }] },
      { ...event, brackets: [{ ...event.brackets[0], notHeld: true }] },
    ];
    for (const row of closedCases) expect(select({ events: [row] })).toBeNull();
  });

  it("offers a real public bracket destination when spectating a launched live event", () => {
    const live = { ...event, status: "in_progress" as const, registrationEnabled: false, brackets: [{ ...event.brackets[0], launchedAt: "2026-11-23T00:00:00Z" }] };
    expect(select({ events: [live] })?.action).toEqual({ kind: "link", label: "View tournament", href: "/tournaments?tournament=hold-the-line&tab=brackets" });
  });

  it("omits the card between events and excludes terminal event or registration history", () => {
    expect(select({ events: [] })).toBeNull();
    for (const status of ["completed", "cancelled", "voided"] as const) {
      expect(select({ events: [{ ...event, status }], registrations: [{ ...registration, tournament_status: status }] })).toBeNull();
    }
  });

  it("omits stale held registrations between events but preserves a genuine outstanding offer", () => {
    const stale = { ...event, registrationCloseAt: "2026-11-23T00:00:00Z" };
    expect(select({ events: [stale], registrations: [registration] })).toBeNull();
    expect(select({ events: [{ ...event, status: "upcoming" }], registrations: [{ ...registration, tournament_status: "upcoming" }] })).toBeNull();
    expect(select({ events: [], registrations: [registration] })).toBeNull();
    expect(select({ events: [stale], registrations: [{ ...registration, waitlist_offer_status: "offered", waitlist_offer_expires_at: later }] })?.action.label).toBe("Review available place");
  });

  it("does not guess event artwork when legacy notifications have ambiguous titles", () => {
    const model = select({ notifications: [notification], events: [event, { ...event, id: "another", slug: "another-event" }] });
    expect(model?.bannerImageUrl).toBeNull();
    expect(model?.action.kind).toBe("review");
  });
});

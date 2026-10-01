// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationCard } from "@/components/dashboard/DashboardRegistrations";
import type { PlayerRegistration } from "@/components/dashboard/registration-presentation";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import { translate } from "@/lib/i18n/translate";
import type { MessageValues } from "@/lib/i18n/types";

vi.mock("@/app/dashboard/registration-actions", () => ({
  respondToWaitlistOfferAction: vi.fn(),
  withdrawTournamentRegistrationAction: vi.fn(),
}));

const registration: PlayerRegistration = {
  id: "22222222-2222-4222-8222-222222222222",
  tournament_title: "IronClad Autumn Championship",
  bracket_name: "Academy",
  registration_status: "approved",
  tournament_bracket_id: "33333333-3333-4333-8333-333333333333",
  elo_status: "verified",
  submitted_elo: 1420,
  withdrawn_at: null,
  waitlist_offer_status: null,
  waitlist_offer_created_at: null,
  waitlist_offer_expires_at: null,
  waitlist_offer_resolved_at: null,
  launched_at: null,
  tournament_status: "registration_open",
  created_at: "2026-09-01T12:00:00.000Z",
};
const t = (path: string, values?: MessageValues) => translate(accountDashboardEnglish, path, values);

afterEach(cleanup);

describe("Dashboard current registration facts", () => {
  it.each([
    ["approved", "statusApproved", "approvedMessage"],
    ["pending", "statusPending", "pendingMessage"],
    ["manual_review", "statusManualReview", "manualReviewMessage"],
    ["waitlisted", "statusWaitlisted", "waitlistedMessage"],
    ["rejected", "statusRejected", "rejectedMessage"],
    ["withdrawn", "statusWithdrawn", "withdrawnMessage"],
  ] as const)("retains the %s state, ELO snapshot, date and exact registration anchor", (status, labelKey, messageKey) => {
    render(<RegistrationCard registration={{ ...registration, registration_status: status }} locale="en" t={t} />);
    const article = screen.getByRole("article");
    expect(article).toHaveAttribute("id", `registration-${registration.id}`);
    expect(article).toHaveAttribute("data-registration-presentation", "current");
    expect(within(article).getByRole("heading", { name: registration.tournament_title })).toBeVisible();
    expect(within(article).getByText(registration.bracket_name, { exact: true })).toBeVisible();
    const statusLabel = article.querySelector(`[data-registration-status="${status}"]`);
    expect(statusLabel).toBeVisible();
    expect(statusLabel).toHaveTextContent(t(`dashboard.registrations.${labelKey}`));
    expect(article).toHaveTextContent(t(`dashboard.registrations.${messageKey}`));
    expect(article).toHaveTextContent(t("dashboard.registrations.eloVerified"));
    expect(article).toHaveTextContent("1,420");
    expect(article.querySelector("time")).toHaveAttribute("datetime", registration.created_at);
  });

  it("preserves missing ELO and unknown verification status without inventing a rating", () => {
    render(<RegistrationCard registration={{ ...registration, submitted_elo: null, elo_status: "unknown" }} locale="en" t={t} />);
    expect(screen.getByRole("article")).toHaveTextContent(t("dashboard.registrations.eloUnavailable"));
    expect(screen.getByRole("article")).toHaveTextContent(t("dashboard.notAvailable"));
    expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
  });
});

describe("Dashboard registration action contract", () => {
  it("keeps the actual current offer controls, deadline and registration form identity", () => {
    render(<RegistrationCard registration={{ ...registration, registration_status: "waitlisted", waitlist_offer_status: "offered", waitlist_offer_expires_at: "2099-09-30T12:00:00.000Z" }} locale="en" t={t} />);
    expect(screen.getByRole("button", { name: "Accept Spot" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decline Spot" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Withdraw Registration" })).toBeEnabled();
    expect(screen.getByText(/Respond before/)).toBeVisible();
    const identities = screen.getByRole("article").querySelectorAll('input[name="registrationId"]');
    expect(identities).toHaveLength(2);
    for (const input of identities) expect(input).toHaveValue(registration.id);
    expect(screen.getAllByText("A tournament place is available", { exact: true })).toHaveLength(1);
  });

  it.each(["cancelled", "voided"] as const)("preserves the defensive %s tournament action guard even with an offered waitlist", (tournamentStatus) => {
    render(<RegistrationCard registration={{ ...registration, registration_status: "waitlisted", tournament_status: tournamentStatus, waitlist_offer_status: "offered", waitlist_offer_expires_at: "2099-09-30T12:00:00.000Z" }} locale="en" t={t} />);
    expect(screen.getByRole("status")).toHaveTextContent(t("dashboard.registrations.historicalTitle"));
    expect(screen.getByRole("status")).toHaveTextContent(t(`dashboard.registrations.${tournamentStatus === "cancelled" ? "cancelledMessage" : "voidedMessage"}`));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("A tournament place is available", { exact: true })).not.toBeInTheDocument();
  });

  it("preserves launch-cancelled waitlist context without offering controls", () => {
    render(<RegistrationCard registration={{ ...registration, registration_status: "waitlisted", tournament_status: "in_progress", launched_at: "2026-09-02T12:00:00.000Z", waitlist_offer_status: "cancelled" }} locale="en" t={t} />);
    expect(screen.getByRole("article")).toHaveTextContent(t("dashboard.registrations.waitlistClosedMessage"));
    expect(screen.getByText("This division has started and its waitlist is now closed.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminTournamentRegistrations from "@/components/admin/tournaments/AdminTournamentRegistrations";
import type { AdminRegistrationReviewRow } from "@/lib/admin-registration-review";
import type { AdminTournamentRegistrationWorkspaceData } from "@/lib/admin-tournament-registration-workspace";
import type { AdminTournamentWorkspaceRow } from "@/lib/admin-tournament-workspace";

vi.mock("@/app/admin/registration-actions", () => ({
  approveSelectedRegistrations: vi.fn(),
  updateRegistrationStatus: vi.fn(),
}));

const TOURNAMENT_A = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_B = "22222222-2222-4222-8222-222222222222";
const REGISTRATION = "33333333-3333-4333-8333-333333333333";

function tournament(id = TOURNAMENT_A) {
  return { id, title: id === TOURNAMENT_A ? "Tournament A" : "Tournament B" } as AdminTournamentWorkspaceRow;
}

function row(tournamentId = TOURNAMENT_A): AdminRegistrationReviewRow {
  return {
    registrationId: REGISTRATION, tournamentId, playerDisplayName: "Shared player",
    tournamentName: "Tournament A", selectedBracket: "Challenge", frozenRegistrationElo: 1250,
    verifiedDivision: "Challenge", verifiedFaction: null, verificationSource: "relic",
    verificationCheckedAt: null, eligibilityRulesVersion: "relic-highest-1v1-v2",
    status: "pending", registeredAt: "2026-10-01T00:00:00.000Z", registrationOrder: 26,
    waitlistPosition: null, waitlistOfferStatus: null, privateAdminNote: "Private note",
    isDivisionLaunched: false,
  };
}

function data(overrides: Partial<AdminTournamentRegistrationWorkspaceData> = {}): AdminTournamentRegistrationWorkspaceData {
  return {
    rows: [row()], selectedRegistration: null, selectedRegistrationUnavailable: false,
    selectedRegistrationIsTerminal: false, activeFilter: "all",
    counts: { all: 72, pending: 12, manual_review: 12, approved: 12, rejected: 12, waitlisted: 12, withdrawn: 12 },
    cohortSummaries: [], waitlistNotices: [], hasBulkApprovableRegistration: true,
    page: 2, pageSize: 25, pageCount: 3, filteredCount: 72,
    ...overrides,
  };
}

afterEach(cleanup);

describe("selected tournament registration workspace", () => {
  it("shows every status and gives pagination and filters explicit tournament scope", () => {
    render(<AdminTournamentRegistrations data={data()} section="registrations" tournament={tournament()} />);
    for (const [label, filter] of [["Pending", "pending"], ["Manual Review", "manual_review"], ["Approved", "approved"], ["Rejected", "rejected"], ["Waitlisted", "waitlisted"], ["Withdrawn", "withdrawn"]]) {
      const link = screen.getByRole("link", { name: `${label} (12)` });
      expect(link).toHaveAttribute("href", `/admin/tournaments/${TOURNAMENT_A}?section=registrations&filter=${filter}`);
    }
    const pages = screen.getByRole("navigation", { name: "Registration pages" });
    expect(within(pages).getByRole("link", { name: "Previous" })).toHaveAttribute("href", `/admin/tournaments/${TOURNAMENT_A}?section=registrations&filter=all&page=1`);
    expect(within(pages).getByRole("link", { name: "Next" })).toHaveAttribute("href", `/admin/tournaments/${TOURNAMENT_A}?section=registrations&filter=all&page=3`);
    expect(screen.getByText(/Select all applies to this page only/)).toBeInTheDocument();
  });

  it("carries tournament, section and page through both bulk and individual action forms", () => {
    const { container } = render(<AdminTournamentRegistrations data={data()} section="registrations" tournament={tournament()} />);
    const bulk = container.querySelector("form");
    expect(bulk?.querySelector('[name="workspaceTournamentId"]')).toHaveValue(TOURNAMENT_A);
    expect(bulk?.querySelector('[name="workspaceSection"]')).toHaveValue("registrations");
    expect(bulk?.querySelector('[name="workspacePage"]')).toHaveValue("2");

    fireEvent.click(screen.getAllByRole("button", { name: "Open actions for Shared player" })[0]);
    const menu = screen.getByRole("menu");
    const approval = within(menu).getByRole("menuitem", { name: "Approve" }).closest("form");
    expect(approval?.querySelector('[name="workspaceTournamentId"]')).toHaveValue(TOURNAMENT_A);
    expect(approval?.querySelector('[name="workspaceSection"]')).toHaveValue("registrations");
    expect(approval?.querySelector('[name="workspacePage"]')).toHaveValue("2");
    expect(within(menu).getByRole("menuitem", { name: "Review Details" })).toHaveAttribute("href", `/admin/tournaments/${TOURNAMENT_A}?section=registrations&page=2&filter=all&selected=${REGISTRATION}`);
  });

  it.each(["tournament", "filter", "page", "refreshed status"])("clears selection and action menu when %s changes", (change) => {
    const view = render(<AdminTournamentRegistrations data={data()} section="registrations" tournament={tournament()} />);
    const selected = view.container.querySelector<HTMLInputElement>('[data-registration-selection="true"]')!;
    fireEvent.click(selected);
    expect(selected.checked).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Open actions for Shared player" })[0]);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const tournamentId = change === "tournament" ? TOURNAMENT_B : TOURNAMENT_A;
    view.rerender(<AdminTournamentRegistrations data={data({
      rows: [{ ...row(tournamentId), status: change === "refreshed status" ? "approved" : "pending" }],
      activeFilter: change === "filter" ? "pending" : "all", page: change === "page" ? 3 : 2,
    })} section="registrations" tournament={tournament(tournamentId)} />);
    expect(Array.from(view.container.querySelectorAll<HTMLInputElement>('[data-registration-selection="true"]')).every((input) => !input.checked)).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps detail form scope and closes back to its original page", () => {
    render(<AdminTournamentRegistrations data={data({ selectedRegistration: row() })} section="registrations" tournament={tournament()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Close registration details" })).toHaveAttribute("href", `/admin/tournaments/${TOURNAMENT_A}?section=registrations&filter=all&page=2`);
    expect(dialog.querySelector('[name="workspaceTournamentId"]')).toHaveValue(TOURNAMENT_A);
    expect(dialog.querySelector('[name="workspaceSection"]')).toHaveValue("registrations");
    expect(dialog.querySelector('[name="workspacePage"]')).toHaveValue("2");
  });

  it("explains scope mismatches without rendering a foreign detail", () => {
    render(<AdminTournamentRegistrations data={data({ selectedRegistrationUnavailable: true })} notice="registration-scope-mismatch" section="registrations" tournament={tournament()} />);
    expect(screen.getByText("No changes were made. Every selected registration must belong to this Tournament.")).toBeInTheDocument();
    expect(screen.getByText(/selected registration is unavailable in this Tournament/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

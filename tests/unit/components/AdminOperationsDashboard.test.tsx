// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import AdminOperationsDashboard from "@/components/admin/operations/AdminOperationsDashboard";
import {
  buildAdminOperationsAttention,
  type AdminOperationsMetrics,
  type AdminOperationsRow,
} from "@/lib/admin-operations-metrics";
import type { WebsiteTrafficAnalytics } from "@/lib/vercel-web-analytics-types";

const previewTraffic: WebsiteTrafficAnalytics = {
  status: "unavailable",
  reason: "non-production",
};

function emptyMetrics(): AdminOperationsMetrics {
  const zeroGrowth = {
    current: 0,
    previous: 0,
    changePercent: 0,
  };
  const divisions = [
    { label: "Academy", value: 0 },
    { label: "Challenge", value: 0 },
    { label: "Main / Pro", value: 0 },
  ];

  return {
    generatedAt: "2026-08-19T12:00:00.000Z",
    period: {
      key: "today",
      label: "Today",
      startAt: "2026-08-19T00:00:00.000Z",
      endAt: "2026-08-19T12:00:00.000Z",
      previousStartAt: "2026-08-18T12:00:00.000Z",
      previousEndAt: "2026-08-19T00:00:00.000Z",
    },
    overview: {
      players: { value: 0, detail: "New Player Profiles · Today", changePercent: 0 },
      registrations: {
        value: 0,
        href: "/admin",
        detail: "Registrations Submitted · Today",
        changePercent: 0,
      },
      activeTournaments: { value: 0, href: "/admin/tournaments", detail: "Now" },
      completedTournaments: {
        value: 0,
        href: "/admin/tournaments",
        detail: "All time",
      },
      openIssues: { value: 0, href: "#attention-required", detail: "Queue items now" },
    },
    attention: buildAdminOperationsAttention({
      openDisputes: 0,
      underAdminReview: 0,
      pendingAdminAssistance: 0,
      overdueMatchActions: 0,
      expiredConfirmationActions: 0,
      expiredWaitlistOffers: 0,
      activeAdminHolds: 0,
    }),
    players: {
      total: 0,
      openAccounts: 0,
      completedProfiles: 0,
      steamLinked: 0,
      relicVerified: 0,
      publicProfiles: 0,
      newInPeriod: 0,
      growth: zeroGrowth,
      daily: [],
      participationByDivision: divisions,
      closedAccounts: [],
    },
    registrations: {
      total: 0,
      registeredInPeriod: 0,
      withdrawnInPeriod: 0,
      withdrawalRate: null,
      growth: zeroGrowth,
      statusGroups: [],
      waitlistOfferGroups: [],
      daily: [],
      withdrawalsDaily: [],
      who: {
        registered: [],
        pending: [],
        manualReview: [],
        withdrawn: [],
        rejected: [],
        waitlisted: [],
        vacancyOffered: [],
        vacancyAccepted: [],
        vacancyDeclined: [],
        vacancyExpired: [],
      },
    },
    tournaments: {
      total: 0,
      active: 0,
      registrationOpenNow: 0,
      launched: 0,
      completed: 0,
      cancelled: 0,
      voided: 0,
      createdInPeriod: 0,
      completedInPeriod: 0,
      completionRate: null,
      statusGroups: [],
      completedByDivision: divisions,
      participationByDivision: divisions,
      dailyCompleted: [],
    },
    matches: {
      total: 0,
      playable: 0,
      readyForActivation: 0,
      active: 0,
      completed: 0,
      statusGroups: [],
      outcomes: {
        played: 0,
        confirmedNoShows: 0,
        doubleForfeits: 0,
        byes: 0,
        walkovers: 0,
        automaticProgressions: 0,
        emptyFeeders: 0,
      },
      resultResolution: {
        playerConfirmed: 0,
        automaticallyConfirmed: 0,
        adminApproved: 0,
        directLegacyAdmin: 0,
      },
      operationalHealth: {
        awaitingConfirmation: 0,
        openDisputes: 0,
        underAdminReview: 0,
        pendingAdminAssistance: 0,
        overdueMatchActions: 0,
        activeAdminHolds: 0,
        expiredConfirmationActions: 0,
        expiredWaitlistOffers: 0,
      },
      who: {
        disputed: [],
        underReview: [],
        overdue: [],
        noShows: [],
        adminAssistance: [],
      },
    },
    health: {
      repeatApprovedParticipants: 0,
      registrationsPerTournament: [],
      completedTournamentRate: null,
      withdrawalRate: null,
    },
  };
}

function whoRow(overrides: Partial<AdminOperationsRow> = {}): AdminOperationsRow {
  return {
    id: "registration-withdrawn",
    primary: "Withdrawn Player",
    secondary: "IronClad Live",
    meta: "Main / Pro · Withdrawn",
    timestamp: "2026-08-19T10:00:00.000Z",
    href: "/admin?filter=withdrawn&selected=registration-withdrawn",
    ...overrides,
  };
}

describe("Admin Operations dashboard contracts", () => {
  afterEach(() => {
    cleanup();
    refreshMock.mockReset();
  });

  it("renders the approved sections, periods, attention queues, and honest empty states", () => {
    const metrics = emptyMetrics();
    metrics.matches.resultResolution.playerConfirmed = 1;
    const { container } = render(
      <AdminOperationsDashboard
        metrics={metrics}
        websiteTraffic={previewTraffic}
      />
    );

    for (const heading of [
      "Operations & Analytics",
      "The operational picture",
      "Actionable Admin queues",
      "Public-site reach",
      "Player readiness and participation",
      "Registration flow and current decisions",
      "Event lifecycle and Division delivery",
      "Match state, outcomes and result resolution",
      "Small-scale launch health",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    const periodLinks = [
      ["Today", "/admin/operations?period=today"],
      ["7 days", "/admin/operations?period=7d"],
      ["30 days", "/admin/operations?period=30d"],
      ["All time", "/admin/operations?period=all"],
    ] as const;
    for (const [label, href] of periodLinks) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href
      );
    }
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    for (const label of [
      "New Player Profiles",
      "Open Player Accounts",
      "Registrations",
      "Registrations submitted",
      "Waiting Now",
      "Completed Events",
      "Opponent Confirmed",
      "Open disputes",
      "Admin reviews",
      "Admin Assistance",
      "Overdue Match actions",
      "Expired confirmations",
      "Expired vacancy offers",
      "Active Admin holds",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    expect(screen.getByText("No open operational issues.")).toBeInTheDocument();
    expect(
      screen.getByText("No registrations are currently pending.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("No Matches currently have an open dispute.")
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("No records are available for this view.").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Website traffic analytics unavailable")
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /Subscriptions|Revenue|subscriber|tracker/i
    );
    for (const misleadingLabel of [
      "Approved Players",
      "Rejected Players",
      "Waitlisted Players",
    ]) {
      expect(screen.queryByText(misleadingLabel, { exact: true }))
        .not.toBeInTheDocument();
    }
  });

  it("renders bounded Who rows as direct links into existing Admin workflows", () => {
    const metrics = emptyMetrics();
    metrics.registrations.who.withdrawn = [whoRow()];
    metrics.matches.who.disputed = [
      whoRow({
        id: "match-disputed",
        primary: "Repeat Player vs Open Player",
        meta: "Open dispute",
        href: "/tournaments?tournament=tournament-live&tab=brackets&match=match-disputed",
      }),
    ];
    metrics.attention = buildAdminOperationsAttention({
      openDisputes: 1,
      underAdminReview: 0,
      pendingAdminAssistance: 0,
      overdueMatchActions: 0,
      expiredConfirmationActions: 0,
      expiredWaitlistOffers: 0,
      activeAdminHolds: 0,
    });
    metrics.overview.openIssues.value = 1;

    render(
      <AdminOperationsDashboard
        metrics={metrics}
        websiteTraffic={previewTraffic}
      />
    );

    const withdrawn = screen.getByRole("link", { name: /Withdrawn Player/ });
    const dispute = screen.getByRole("link", {
      name: /Repeat Player vs Open Player/,
    });
    expect(withdrawn).toHaveAttribute(
      "href",
      "/admin?filter=withdrawn&selected=registration-withdrawn"
    );
    expect(dispute).toHaveAttribute(
      "href",
      "/tournaments?tournament=tournament-live&tab=brackets&match=match-disputed"
    );
    expect(withdrawn).toHaveClass("min-h-11", "flex-col", "sm:flex-row");
    expect(dispute).toHaveClass("min-h-11", "flex-col", "sm:flex-row");
    expect(screen.queryByText("No open operational issues.")).not.toBeInTheDocument();
  });

  it("keeps period, KPI, disclosure, and Who-row layouts usable on narrow screens", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "components/admin/operations/AdminOperationsDashboard.tsx"
      ),
      "utf8"
    );

    expect(source).toContain(
      "min-h-screen min-w-0 bg-black px-4 pb-20 pt-28 text-white sm:px-6"
    );
    expect(source).toContain("mx-auto max-w-7xl");
    expect(source).toContain("grid grid-cols-2 gap-2 sm:flex sm:flex-wrap");
    expect(source).toContain("mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5");
    expect(source).toContain(
      "summary className=\"flex min-h-11 cursor-pointer"
    );
    expect(source).toContain(
      "flex min-h-11 min-w-0 flex-col gap-3 rounded-xl"
    );
    expect(source).toContain("sm:flex-row sm:items-center sm:justify-between");
    expect(source.indexOf('id="attention-required"')).toBeLessThan(
      source.indexOf("<WebsiteTrafficSection")
    );
    expect(source.indexOf("<WebsiteTrafficSection")).toBeLessThan(
      source.indexOf('id="players"')
    );
    expect(source).toContain("<svg");
    expect(source).toContain('<table className="sr-only">');
    expect(source).not.toContain("overflow-x-auto");
    for (const misleadingLabel of [
      'label: "Approved Players"',
      'label: "Rejected Players"',
      'label: "Waitlisted Players"',
      'title="Approved Players"',
      'title="Rejected Players"',
      'title="Waitlisted Players"',
    ]) {
      expect(source).not.toContain(misleadingLabel);
    }
    expect(source).not.toMatch(/Subscriptions|Revenue|subscriber|tracker/i);
  });
});

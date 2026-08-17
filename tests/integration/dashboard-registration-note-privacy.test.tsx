// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const loadPlayerCareerDashboardMock = vi.hoisted(() => vi.fn());
const loadPlayerNotificationsMock = vi.hoisted(() => vi.fn());
const loadCommunityPollsForRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/components/DashboardChampionHistory", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/DashboardMatchHistory", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/DashboardNotifications", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/DiscordContactVisibilityCard", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/InAppNotificationCenter", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/PollsAndDecisions", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/PublicProfileVisibilityCard", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/lib/notifications", () => ({
  loadPlayerNotifications: loadPlayerNotificationsMock,
}));

vi.mock("@/lib/player-dashboard", () => ({
  loadPlayerCareerDashboard: loadPlayerCareerDashboardMock,
}));

vi.mock("@/lib/player-polls", () => ({
  loadCommunityPollsForRequest: loadCommunityPollsForRequestMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import PlayerDashboardPage from "@/app/dashboard/page";

const PRIVATE_ADMIN_NOTE =
  "PRIVATE_ADMIN_NOTE must never reach a player-facing payload";

describe("dashboard registration-note privacy", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_registration_note_player" });
    loadPlayerCareerDashboardMock.mockResolvedValue({
      notifications: [],
      champions: [],
      statistics: {
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        winRate: 0,
        tournamentsParticipated: 0,
        tournamentsWon: 0,
      },
      matchHistory: [],
      error: null,
    });
    loadPlayerNotificationsMock.mockResolvedValue({
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      error: null,
    });
    loadCommunityPollsForRequestMock.mockResolvedValue({
      polls: [],
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    [
      "rejected",
      "Registration rejected",
      "Your registration was not approved for this event.",
    ],
    [
      "manual_review",
      "Manual review required",
      "An administrator needs additional review before making a final decision.",
    ],
  ] as const)(
    "keeps a private note out of the %s registration response",
    async (registrationStatus, title, message) => {
      const client = createDashboardClient(registrationStatus);
      createAuthenticatedSupabaseClientMock.mockResolvedValue(client);

      render(await PlayerDashboardPage());

      const [registrationColumns] = vi.mocked(
        client.registrationsQuery.select
      ).mock.calls[0];
      expect(registrationColumns).toEqual(expect.any(String));
      expect(String(registrationColumns)).not.toContain("admin_notes");
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.queryByText(PRIVATE_ADMIN_NOTE)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain(PRIVATE_ADMIN_NOTE);
      expect(document.body.textContent).not.toContain("Admin Note");
    }
  );

  it.each(["cancelled", "voided"] as const)(
    "renders a %s tournament registration as factual read-only history",
    async (tournamentStatus) => {
      const client = createDashboardClient("waitlisted", {
        waitlist_offer_status: "offered",
        waitlist_offer_expires_at: "2099-08-07T03:00:00.000Z",
        tournaments: { status: tournamentStatus },
      });
      createAuthenticatedSupabaseClientMock.mockResolvedValue(client);

      render(await PlayerDashboardPage());

      const [registrationColumns] = vi.mocked(
        client.registrationsQuery.select
      ).mock.calls[0];
      expect(String(registrationColumns)).toContain(
        "tournaments!inner(status)"
      );
      expect(screen.getByText("Read-only historical record")).toBeInTheDocument();
      expect(screen.getByText("Privacy Test Tournament")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Accept Spot" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Decline Spot" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Withdraw Registration" })
      ).not.toBeInTheDocument();
    }
  );
});

function createDashboardClient(
  registrationStatus: "rejected" | "manual_review" | "waitlisted",
  registrationOverrides: Record<string, unknown> = {}
) {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);

  const registrationsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(async () => ({
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tournament_title: "Privacy Test Tournament",
          bracket_name: "Challenge Bracket",
          registration_status: registrationStatus,
          elo_status: "verified",
          submitted_elo: 1250,
          tournament_bracket_id: "22222222-2222-4222-8222-222222222222",
          withdrawn_at: null,
          waitlist_offer_status: null,
          waitlist_offer_created_at: null,
          waitlist_offer_expires_at: null,
          waitlist_offer_resolved_at: null,
          tournament_brackets: { launched_at: null },
          tournaments: { status: "registration_open" },
          admin_notes: PRIVATE_ADMIN_NOTE,
          created_at: "2026-08-05T00:00:00.000Z",
          ...registrationOverrides,
        },
      ],
      error: null,
    })),
  };
  registrationsQuery.select.mockReturnValue(registrationsQuery);
  registrationsQuery.eq.mockReturnValue(registrationsQuery);

  return {
    from: vi.fn((table: string) => {
      if (table === "players") return profileQuery;
      if (table === "registrations") return registrationsQuery;
      throw new Error(`Unexpected dashboard table: ${table}`);
    }),
    registrationsQuery,
  };
}

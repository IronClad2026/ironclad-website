// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import type { PollViewerProjection } from "@/lib/polls";
import type { TournamentCard } from "@/lib/tournaments";

const pollsAndDecisionsMock = vi.hoisted(() =>
  vi.fn(({ surface }: { surface: string }) => (
    <section data-testid="polls-and-decisions">{surface}</section>
  ))
);

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn(), isSignedIn: false, userId: null }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams(
      `tournament=${TOURNAMENT_ID}&tab=decisions&poll=${POLL_ID}`
    ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/app/tournaments/actions", () => ({
  submitTournamentRegistration: vi.fn(),
}));
vi.mock("@/components/PollsAndDecisions", () => ({
  default: pollsAndDecisionsMock,
}));
vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/supabase-browser", () => ({
  createAuthenticatedBrowserSupabaseClient: vi.fn(() => ({})),
}));

import TournamentsExperience from "@/components/TournamentsExperience";

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const POLL_ID = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  cleanup();
  pollsAndDecisionsMock.mockClear();
});

describe("Tournament Polls & Decisions surface", () => {
  it("uses one shared component in desktop/mobile and never gates frozen eligibility on current registrations", () => {
    const poll = makePoll();
    render(
      <TournamentsExperience
        tournaments={[makeTournament()]}
        tournamentPollsByTournament={{ [TOURNAMENT_ID]: [poll] }}
        pollLoadError={null}
        viewer={{
          isAdmin: false,
          relicVerifiedDivision: null,
          registrationIds: [],
          registrations: [],
        }}
        matchResultSubmissions={[]}
        matchResultReportGroups={[]}
        eloVerificationEnabled
      />
    );

    expect(screen.getAllByTestId("polls-and-decisions")).toHaveLength(2);
    expect(pollsAndDecisionsMock).toHaveBeenCalledTimes(2);
    for (const [props] of pollsAndDecisionsMock.mock.calls) {
      expect(props).toMatchObject({
        surface: "tournament",
        tournamentId: TOURNAMENT_ID,
        initialPolls: [poll],
        highlightedPollId: POLL_ID,
      });
      expect(props).not.toHaveProperty("viewerRegistrations");
    }
  });

  it("presents all six mobile tabs as an accessible three-by-two grid", () => {
    render(
      <TournamentsExperience
        tournaments={[makeTournament()]}
        tournamentPollsByTournament={{ [TOURNAMENT_ID]: [] }}
        viewer={{
          isAdmin: false,
          relicVerifiedDivision: null,
          registrationIds: [],
          registrations: [],
        }}
        matchResultSubmissions={[]}
        matchResultReportGroups={[]}
        eloVerificationEnabled
      />
    );

    const navigation = screen.getByRole("navigation", {
      name: competitionEnglish.tournaments.tournamentNavigation,
    });
    expect(within(navigation).getAllByRole("button")).toHaveLength(6);
    expect(navigation.firstElementChild).toHaveClass("grid-cols-3");
    expect(
      within(navigation).getByRole("button", { name: /Polls & Decisions/i })
    ).toHaveClass("min-h-11", "col-span-1");
    const announcements = within(navigation).getByRole("button", {
      name: /Announcements/i,
    });
    expect(announcements).toHaveClass("flex-col", "tracking-normal");
    expect(announcements.querySelector("span")).toHaveClass("break-normal");
  });
});

function makePoll(): PollViewerProjection {
  return {
    id: POLL_ID,
    purpose: "tournament_decision",
    audienceKind: "tournament_approved",
    tournamentId: TOURNAMENT_ID,
    tournamentBracketId: null,
    question: "Frozen eligible question",
    context: null,
    optionSource: "text",
    maxSelections: 1,
    winnerCount: 1,
    authority: "binding",
    resultVisibility: "after_close",
    publicFinalTotals: false,
    opensAt: "2026-08-18T00:00:00.000Z",
    closesAt: "2099-08-25T00:00:00.000Z",
    publishedAt: "2026-08-17T00:00:00.000Z",
    cancelledAt: null,
    cancellationReason: null,
    finalDecisionPublishedAt: null,
    finalDecisionBasis: null,
    finalRationale: null,
    bindingTieRuleUsed: false,
    status: "open",
    ballotRevision: 0,
    selectedOptionIds: [],
    options: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        position: 1,
        label: "Option A",
        map: null,
        pollResultRank: null,
        finalDecisionRank: null,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        position: 2,
        label: "Option B",
        map: null,
        pollResultRank: null,
        finalDecisionRank: null,
      },
    ],
  };
}

function makeTournament(): TournamentCard {
  return {
    id: TOURNAMENT_ID,
    slug: "feature-c-tournament",
    title: "Feature C Tournament",
    month: "August 2026",
    format: "1v1",
    ruleFormat: "format_a",
    ruleFormatLabel: "Format A",
    status: "Open",
    statusValue: "registration_open",
    image: "/images/tournaments/1v1-operation-skyfall.jpeg",
    description: "Feature C surface fixture.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "August 2026",
    prizePool: "",
    players: 0,
    maxPlayers: 8,
    brackets: [],
    details: "Feature C surface fixture.",
    rules: "Format A rules.",
    schedule: [],
    contact: "IronClad Admin",
    registrationEnabled: true,
    registrationOpenAt: "2026-08-01T00:00:00.000Z",
    registrationCloseAt: "2026-08-31T00:00:00.000Z",
    grandFinalAt: "2026-08-31T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    resultConfirmationWindowMinutes: 30,
    rulesUrl: null,
    battlefyUrl: null,
    participants: [],
    bracketParticipants: [],
    generatedBrackets: [],
    mapPools: [],
  };
}

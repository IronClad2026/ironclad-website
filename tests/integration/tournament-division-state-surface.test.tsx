// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { translate } from "@/lib/i18n/translate";
import { resolveTournamentDivisionStates } from "@/lib/tournament-division-state";
import type { TournamentCard } from "@/lib/tournaments";

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn(), isSignedIn: false, userId: null }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({
    push: routerPush,
    refresh: vi.fn(),
    replace: routerReplace,
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/tournaments/actions", () => ({
  submitTournamentRegistration: vi.fn(),
}));

vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/supabase-browser", () => ({
  createAuthenticatedBrowserSupabaseClient: vi.fn(() => ({})),
}));

import TournamentsExperience from "@/components/TournamentsExperience";

const EVENT_A_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_B_ID = "11111111-1111-4111-8111-111111111112";
const EVENT_A_ACADEMY_ID = "22222222-2222-4222-8222-222222222221";
const EVENT_A_CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_A_MAIN_ID = "22222222-2222-4222-8222-222222222223";
const EVENT_B_ACADEMY_ID = "22222222-2222-4222-8222-222222222224";
const CANCELLED_EVENT_ID = "11111111-1111-4111-8111-111111111113";
const NOT_HELD_EVENT_ID = "11111111-1111-4111-8111-111111111114";
const NOT_HELD_ACADEMY_ID = "22222222-2222-4222-8222-222222222225";
const DUPLICATE_TITLE = "Shared Event Title";

const eventA = makeTournament({
  id: EVENT_A_ID,
  slug: "event-a",
  status: "In Progress",
  statusValue: "in_progress",
  brackets: [
    makeBracket(EVENT_A_ACADEMY_ID, "Academy Bracket", 8, true),
    makeBracket(EVENT_A_CHALLENGE_ID, "Challenge Bracket", 8, true),
    makeBracket(EVENT_A_MAIN_ID, "Main / Pro Bracket", 5, false),
  ],
  divisionStates: resolveTournamentDivisionStates({
    tournamentId: EVENT_A_ID,
    eventStatus: "in_progress",
    divisions: [
      {
        canonicalName: "Academy",
        bracketId: EVENT_A_ACADEMY_ID,
        approvedCount: 8,
        requiredCount: 8,
        isReady: true,
        launchedAt: "2026-08-01T00:00:00.000Z",
        generatedBracketId: "33333333-3333-4333-8333-333333333331",
        isCompetitionComplete: true,
      },
      {
        canonicalName: "Challenge",
        bracketId: EVENT_A_CHALLENGE_ID,
        approvedCount: 8,
        requiredCount: 8,
        isReady: true,
        launchedAt: "2026-08-02T00:00:00.000Z",
        generatedBracketId: "33333333-3333-4333-8333-333333333332",
        isCompetitionComplete: false,
      },
      {
        canonicalName: "Main",
        bracketId: EVENT_A_MAIN_ID,
        approvedCount: 5,
        requiredCount: 8,
        isReady: false,
        launchedAt: null,
        generatedBracketId: null,
        isCompetitionComplete: false,
      },
    ],
  }),
});

const eventB = makeTournament({
  id: EVENT_B_ID,
  slug: "event-b",
  status: "Open",
  statusValue: "registration_open",
  brackets: [
    makeBracket(EVENT_B_ACADEMY_ID, "Academy Bracket", 3, false),
  ],
  divisionStates: resolveTournamentDivisionStates({
    tournamentId: EVENT_B_ID,
    eventStatus: "registration_open",
    divisions: [
      {
        canonicalName: "Academy",
        bracketId: EVENT_B_ACADEMY_ID,
        approvedCount: 3,
        requiredCount: 8,
        isReady: false,
        launchedAt: null,
        generatedBracketId: null,
        isCompetitionComplete: false,
      },
    ],
  }),
});

const cancelledEvent = makeTournament({
  id: CANCELLED_EVENT_ID,
  slug: "cancelled-event",
  status: "Cancelled",
  statusValue: "cancelled",
  brackets: [
    makeBracket(EVENT_A_ACADEMY_ID, "Academy Bracket", 8, true),
    makeBracket(EVENT_A_CHALLENGE_ID, "Challenge Bracket", 4, false),
  ],
  divisionStates: resolveTournamentDivisionStates({
    tournamentId: CANCELLED_EVENT_ID,
    eventStatus: "cancelled",
    divisions: [
      {
        canonicalName: "Academy",
        bracketId: EVENT_A_ACADEMY_ID,
        approvedCount: 8,
        requiredCount: 8,
        isReady: true,
        launchedAt: "2026-08-01T00:00:00.000Z",
        generatedBracketId: "33333333-3333-4333-8333-333333333333",
        isCompetitionComplete: true,
      },
      {
        canonicalName: "Challenge",
        bracketId: EVENT_A_CHALLENGE_ID,
        approvedCount: 4,
        requiredCount: 8,
        isReady: false,
        launchedAt: null,
        generatedBracketId: null,
        isCompetitionComplete: false,
      },
    ],
  }),
});

const notHeldEvent: TournamentCard = {
  ...makeTournament({
    id: NOT_HELD_EVENT_ID,
    slug: "not-held-event",
    status: "Open",
    statusValue: "registration_open",
    brackets: [
      makeBracket(NOT_HELD_ACADEMY_ID, "Academy Bracket", 3, false),
    ],
    divisionStates: resolveTournamentDivisionStates({
      tournamentId: NOT_HELD_EVENT_ID,
      eventStatus: "registration_open",
      divisions: [
        {
          canonicalName: "Academy",
          bracketId: NOT_HELD_ACADEMY_ID,
          approvedCount: 3,
          requiredCount: 8,
          isReady: false,
          launchedAt: null,
          generatedBracketId: null,
          isCompetitionComplete: false,
          notHeldAt: "2026-08-05T00:00:00.000Z",
          notHeldReasonCode: "minimum_roster_not_reached",
        },
      ],
    }),
  }),
  registrationEnabled: false,
};

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView"
);

describe("public Tournament division-state surface", () => {
  beforeEach(() => {
    window.history.replaceState(
      {},
      "",
      "/tournaments?tournament=event-b&tab=overview&panel=details"
    );
    routerPush.mockReset();
    routerReplace.mockReset();
    routerPush.mockImplementation((href: string) => {
      window.history.pushState({}, "", href);
    });
    routerReplace.mockImplementation((href: string) => {
      window.history.replaceState({}, "", href);
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");

    if (originalScrollIntoView) {
      Object.defineProperty(
        Element.prototype,
        "scrollIntoView",
        originalScrollIntoView
      );
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("shows independent mixed states for each Event", () => {
    const { container } = renderExperience();
    const sidebar = getDesktopSidebar(container);
    const eventASummary = getEventSummary(sidebar, EVENT_A_ID);
    const eventBSummary = getEventSummary(sidebar, EVENT_B_ID);

    expectDivisionState(
      eventASummary,
      "Academy",
      "completed",
      `Academy Bracket: ${competitionEnglish.tournaments.divisionState.completed}`
    );
    expectDivisionState(
      eventASummary,
      "Challenge",
      "in_progress",
      `Challenge Bracket: ${competitionEnglish.tournaments.divisionState.inProgress}`
    );
    expectDivisionState(
      eventASummary,
      "Main",
      "filling",
      `Main / Pro Bracket: ${translate(
        competitionEnglish,
        "tournaments.divisionState.filling",
        { approved: 5, required: 8 }
      )}`
    );

    expectDivisionState(
      eventBSummary,
      "Academy",
      "filling",
      `Academy Bracket: ${translate(
        competitionEnglish,
        "tournaments.divisionState.filling",
        { approved: 3, required: 8 }
      )}`
    );
    expectDivisionState(
      eventBSummary,
      "Challenge",
      "disabled",
      `Challenge Bracket: ${competitionEnglish.tournaments.divisionState.disabled}`
    );
    expectDivisionState(
      eventBSummary,
      "Main",
      "disabled",
      `Main / Pro Bracket: ${competitionEnglish.tournaments.divisionState.disabled}`
    );
  });

  it("selects duplicate-title Events by stable ID on desktop and mobile", () => {
    const view = renderExperience();
    let sidebar = getDesktopSidebar(view.container);
    let eventAButton = getEventButton(getEventSummary(sidebar, EVENT_A_ID));
    let eventBButton = getEventButton(getEventSummary(sidebar, EVENT_B_ID));

    expect(eventA.title).toBe(eventB.title);
    expect(eventAButton).toHaveAttribute("aria-pressed", "false");
    expect(eventBButton).toHaveAttribute("aria-pressed", "true");
    expect(eventAButton).not.toHaveClass("ring-2", "ring-orange-500");
    expect(eventBButton).toHaveClass("ring-2", "ring-orange-500");

    fireEvent.click(
      screen.getByRole("button", {
        name: competitionEnglish.tournaments.tournamentMenu,
      })
    );
    const mobileMenu = screen.getByRole("dialog", {
      name: competitionEnglish.tournaments.tournamentMenu,
    });
    const mobileEventAButton = getEventButton(
      getEventSummary(mobileMenu, EVENT_A_ID)
    );
    const mobileEventBButton = getEventButton(
      getEventSummary(mobileMenu, EVENT_B_ID)
    );

    expect(mobileEventAButton).toHaveClass("border-white/12");
    expect(mobileEventBButton).toHaveClass("border-orange-400/70");
    expect(mobileEventAButton).toHaveAttribute("aria-pressed", "false");
    expect(mobileEventBButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(mobileEventAButton);

    expect(routerPush).toHaveBeenCalledWith(
      "/tournaments?tournament=event-a&tab=overview&panel=details",
      { scroll: false }
    );

    view.rerender(experience());
    sidebar = getDesktopSidebar(view.container);
    eventAButton = getEventButton(getEventSummary(sidebar, EVENT_A_ID));
    eventBButton = getEventButton(getEventSummary(sidebar, EVENT_B_ID));

    expect(eventAButton).toHaveClass("ring-2", "ring-orange-500");
    expect(eventBButton).not.toHaveClass("ring-2", "ring-orange-500");
    expect(eventAButton).toHaveAttribute("aria-pressed", "true");
    expect(eventBButton).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a terminal overlay for enabled divisions without erasing Disabled", () => {
    window.history.replaceState(
      {},
      "",
      "/tournaments?tournament=cancelled-event&tab=overview&panel=details"
    );
    const { container } = render(experience([cancelledEvent]));
    const summary = getEventSummary(container, CANCELLED_EVENT_ID);
    const academy = getDivisionState(summary, "Academy");
    const challenge = getDivisionState(summary, "Challenge");
    const main = getDivisionState(summary, "Main");

    expect(academy).toHaveAttribute("data-division-state", "completed");
    expect(academy).toHaveAttribute(
      "data-division-effective-state",
      "cancelled"
    );
    expect(academy).toHaveTextContent("Academy Bracket: Cancelled");
    expect(academy.firstElementChild).toHaveClass("text-orange-200");

    expect(challenge).toHaveAttribute("data-division-state", "filling");
    expect(challenge).toHaveAttribute(
      "data-division-effective-state",
      "cancelled"
    );
    expect(challenge).toHaveTextContent("Challenge Bracket: Cancelled");

    expect(main).toHaveAttribute("data-division-state", "disabled");
    expect(main).toHaveAttribute("data-division-effective-state", "disabled");
    expect(main).toHaveTextContent("Main / Pro Bracket: Disabled");
    expect(main.firstElementChild).toHaveClass("text-zinc-300");
  });

  it("shows an all-Not-Held Event distinctly and disables registration", () => {
    window.history.replaceState(
      {},
      "",
      "/tournaments?tournament=not-held-event&tab=overview&panel=details"
    );
    const { container } = render(experience([notHeldEvent]));
    const summary = getEventSummary(container, NOT_HELD_EVENT_ID);
    const academy = getDivisionState(summary, "Academy");

    expect(academy).toHaveAttribute("data-division-state", "not_held");
    expect(academy).toHaveTextContent(
      `Academy Bracket: ${competitionEnglish.tournaments.divisionState.notHeld}`
    );
    expect(getEventButton(summary)).toHaveTextContent("Not Held");
    expect(
      screen
        .getAllByRole("button")
        .filter(
          (button) =>
            button.textContent?.includes(
              competitionEnglish.tournaments.divisionState.notHeld
            ) && button.hasAttribute("disabled")
        )
    ).not.toHaveLength(0);
  });
});

function renderExperience() {
  return render(experience());
}

function experience(tournaments = [eventA, eventB]) {
  return (
    <TournamentsExperience
      tournaments={tournaments}
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
}

function makeTournament({
  id,
  slug,
  status,
  statusValue,
  brackets,
  divisionStates,
}: Pick<
  TournamentCard,
  "id" | "slug" | "status" | "statusValue" | "brackets" | "divisionStates"
>): TournamentCard {
  return {
    id,
    slug,
    title: DUPLICATE_TITLE,
    format: "1v1",
    ruleFormat: "format_a",
    ruleFormatLabel: "Format A",
    status,
    statusValue,
    image: "/images/tournaments/1v1-operation-skyfall.jpeg",
    description: `${slug} public division-state fixture.`,
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    prizePool: "",
    players: brackets.reduce(
      (total, bracket) => total + bracket.registeredPlayers,
      0
    ),
    maxPlayers: brackets.reduce(
      (total, bracket) => total + bracket.activeCohortSize,
      0
    ),
    brackets,
    divisionStates,
    details: `${slug} details.`,
    rules: "Format A rules.",
    schedule: [],
    contact: "IronClad Admin",
    registrationEnabled: true,
    registrationOpenAt: "2026-01-01T00:00:00.000Z",
    registrationCloseAt: "2099-12-31T23:59:59.000Z",
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

function makeBracket(
  id: string,
  name: string,
  approvedCount: number,
  launched: boolean
): TournamentCard["brackets"][number] {
  return {
    id,
    name,
    requirement: "Fixture ELO requirement",
    maxPlayers: "Max 8",
    registeredPlayers: approvedCount,
    activeCohortPlayers: approvedCount,
    activeCohortSize: 8,
    waitlistedPlayers: 0,
    isFull: approvedCount === 8,
    isWaitlistOnly: approvedCount === 8 && !launched,
    launchedAt: launched ? "2026-08-01T00:00:00.000Z" : null,
    prize: "Fixture division",
  };
}

function getDesktopSidebar(container: HTMLElement) {
  const sidebar = container.querySelector("aside.hidden");

  if (!(sidebar instanceof HTMLElement)) {
    throw new Error("Desktop Tournament sidebar was not rendered.");
  }

  return sidebar;
}

function getEventSummary(container: HTMLElement, tournamentId: string) {
  const summary = container.querySelector(
    `[data-tournament-division-state-summary="${tournamentId}"]`
  );

  if (!(summary instanceof HTMLElement)) {
    throw new Error(`Division-state summary was missing for ${tournamentId}.`);
  }

  return summary;
}

function getEventButton(summary: HTMLElement) {
  const button = summary.closest("button");

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Division-state summary was not inside an Event button.");
  }

  return button;
}

function expectDivisionState(
  summary: HTMLElement,
  divisionName: "Academy" | "Challenge" | "Main",
  state: "disabled" | "filling" | "in_progress" | "completed" | "not_held",
  expectedText: string
) {
  const stateElement = getDivisionState(summary, divisionName);

  expect(stateElement).toHaveAttribute("data-division-state", state);
  expect(stateElement).toHaveTextContent(expectedText);
}

function getDivisionState(
  summary: HTMLElement,
  divisionName: "Academy" | "Challenge" | "Main"
) {
  const stateElement = summary.querySelector(
    `[data-division-name="${divisionName}"]`
  );

  if (!(stateElement instanceof HTMLElement)) {
    throw new Error(`Division state was missing for ${divisionName}.`);
  }

  return stateElement;
}

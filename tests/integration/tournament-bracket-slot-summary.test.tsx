// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import { loadDictionary } from "@/lib/i18n/loaders";
import { interpolateMessage } from "@/lib/i18n/translate";
import { resolveTournamentDivisionStates } from "@/lib/tournament-division-state";
import type {
  GeneratedTournamentMatch,
  TournamentCard,
  TournamentParticipant,
} from "@/lib/tournaments";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: vi.fn(), isSignedIn: false, userId: null }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
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

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const BRACKET_ID = "22222222-2222-4222-8222-222222222222";
const EXPECTED_SLOT_SUMMARIES: Record<Locale, string> = {
  en: "FORMAT — 8 player slots",
  it: "FORMAT — 8 posti per giocatori",
  "zh-CN": "FORMAT — 8 个参赛名额",
  ru: "FORMAT — количество мест для игроков: 8",
  es: "FORMAT — 8 plazas para jugadores",
  "pt-BR": "FORMAT — 8 vagas para jogadores",
  ko: "FORMAT — 플레이어 자리 8개",
  fr: "FORMAT — 8 places pour joueurs",
};

describe("public generated-bracket slot summary", () => {
  beforeEach(() => {
    window.history.replaceState(
      {},
      "",
      `/tournaments?tournament=completed-eight-player-bracket&tab=brackets`
    );
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("describes total player slots truthfully in both desktop and mobile without changing the completed bracket", () => {
    const { container } = render(
      <TournamentsExperience
        tournaments={[makeTournament()]}
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

    expect(
      screen.getAllByText("Single Elimination — 8 player slots")
    ).toHaveLength(2);
    expect(screen.queryByText(/8 empty player slots/i)).not.toBeInTheDocument();

    for (let player = 1; player <= 8; player += 1) {
      expect(screen.getAllByText(`TestMain${player}`).length).toBeGreaterThanOrEqual(
        2
      );
    }
    expect(
      screen.getAllByRole("heading", { name: "TestMain1" })
    ).toHaveLength(2);
    expect(screen.getAllByText("Tournament Winner")).toHaveLength(2);
    expect(screen.getAllByText("Quarterfinals")).toHaveLength(2);
    expect(screen.getAllByText("Semifinals")).toHaveLength(2);
    expect(screen.getAllByText("Grand Final")).toHaveLength(2);
    expect(container.querySelectorAll('[id^="match-desktop-"]')).toHaveLength(
      7
    );
    expect(container.querySelectorAll('[id^="match-mobile-"]')).toHaveLength(
      7
    );
    expect(
      container.querySelector("#match-desktop-match-7")
    ).toHaveTextContent(/TestMain1.*3.*TestMain5.*1/);
    expect(
      container.querySelector("#match-mobile-match-7")
    ).toHaveTextContent(/TestMain1.*3.*TestMain5.*1/);
  });

  it("keeps the truthful format and total-slot count in all eight Player locales", async () => {
    const messagesByLocale = await Promise.all(
      SUPPORTED_LOCALES.map(async (locale) => {
        const competition = await loadDictionary(locale, "competition");
        return [
          locale,
          interpolateMessage(competition.bracketSummary.playerSlots, {
            format: "FORMAT",
            count: 8,
          }),
        ] as const;
      })
    );

    expect(SUPPORTED_LOCALES).toHaveLength(8);
    expect(messagesByLocale).toHaveLength(8);
    for (const [locale, message] of messagesByLocale) {
      expect(message).toBe(EXPECTED_SLOT_SUMMARIES[locale]);
    }
    expect(messagesByLocale[0][1]).not.toContain("empty player slots");
  });
});

function makeTournament(): TournamentCard {
  const participants = Array.from({ length: 8 }, (_, index) =>
    makeParticipant(index + 1)
  );

  return {
    id: TOURNAMENT_ID,
    slug: "completed-eight-player-bracket",
    title: "Completed Eight Player Bracket",
    month: "August 2026",
    format: "1v1",
    ruleFormat: "format_a",
    ruleFormatLabel: "Format A",
    status: "Completed",
    statusValue: "completed",
    image: "/images/tournaments/1v1-operation-skyfall.jpeg",
    description: "Completed bracket regression fixture.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "August 2026",
    prizePool: "",
    players: 8,
    maxPlayers: 8,
    brackets: [
      {
        id: BRACKET_ID,
        name: "Main / Pro Bracket",
        requirement: "1400+ ELO",
        maxPlayers: "Max 8",
        registeredPlayers: 8,
        activeCohortPlayers: 8,
        activeCohortSize: 8,
        waitlistedPlayers: 0,
        isFull: true,
        isWaitlistOnly: false,
        launchedAt: "2026-08-25T00:00:00.000Z",
        prize: "Main / Pro division",
      },
    ],
    divisionStates: resolveTournamentDivisionStates({
      tournamentId: TOURNAMENT_ID,
      eventStatus: "completed",
      divisions: [
        {
          canonicalName: "Main",
          bracketId: BRACKET_ID,
          approvedCount: 8,
          requiredCount: 8,
          isReady: true,
          launchedAt: "2026-08-25T00:00:00.000Z",
          generatedBracketId: "33333333-3333-4333-8333-333333333333",
          isCompetitionComplete: true,
        },
      ],
    }),
    details: "Completed bracket regression fixture.",
    rules: "Format A rules.",
    schedule: [],
    contact: "IronClad Admin",
    registrationEnabled: false,
    registrationOpenAt: "2026-08-01T00:00:00.000Z",
    registrationCloseAt: "2026-08-20T00:00:00.000Z",
    grandFinalAt: "2026-08-25T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    resultConfirmationWindowMinutes: 30,
    rulesUrl: null,
    battlefyUrl: null,
    participants,
    bracketParticipants: participants,
    generatedBrackets: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        tournamentBracketId: BRACKET_ID,
        format: "single_elimination",
        slotCount: 8,
        generatedAt: "2026-08-25T00:00:00.000Z",
        matches: makeMatches(),
        standings: [],
      },
    ],
    mapPools: [],
  };
}

function makeParticipant(player: number): TournamentParticipant {
  return {
    registrationId: `registration-${player}`,
    name: `TestMain${player}`,
    country: "Australia",
    elo: 1500 + player,
    status: "approved",
    bracketId: BRACKET_ID,
    bracketName: "Main / Pro Bracket",
  };
}

function makeMatches(): GeneratedTournamentMatch[] {
  return [
    makeMatch(1, "Quarterfinals", 1, 1, 1, 2, 1, 2, 0),
    makeMatch(2, "Quarterfinals", 1, 2, 3, 4, 3, 2, 0),
    makeMatch(3, "Quarterfinals", 1, 3, 5, 6, 5, 2, 0),
    makeMatch(4, "Quarterfinals", 1, 4, 7, 8, 7, 2, 0),
    makeMatch(5, "Semifinals", 2, 1, 1, 3, 1, 2, 0),
    makeMatch(6, "Semifinals", 2, 2, 5, 7, 5, 2, 0),
    makeMatch(7, "Grand Final", 3, 1, 1, 5, 1, 3, 1, 5),
  ];
}

function makeMatch(
  match: number,
  roundName: string,
  roundNumber: number,
  matchNumber: number,
  playerOne: number,
  playerTwo: number,
  winner: number,
  playerOneScore: number,
  playerTwoScore: number,
  seriesBestOf = 3
): GeneratedTournamentMatch {
  return {
    id: `match-${match}`,
    seriesBestOf,
    roundName,
    roundNumber,
    matchNumber,
    status: "completed",
    activationVersion: 1,
    activatedAt: "2026-08-25T00:00:00.000Z",
    deadlineAt: null,
    outcomeType: null,
    deadlineRuledAt: null,
    extensionMinutes: null,
    extendedAt: null,
    holdStartedAt: null,
    holdReleasedAt: null,
    playerOneRegistrationId: `registration-${playerOne}`,
    playerTwoRegistrationId: `registration-${playerTwo}`,
    playerOneSlot: playerOne,
    playerTwoSlot: playerTwo,
    playerOneScore,
    playerTwoScore,
    winnerRegistrationId: `registration-${winner}`,
  };
}

// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TournamentCard } from "@/lib/tournaments";

const refreshMock = vi.hoisted(() => vi.fn());
const submitTournamentRegistrationMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
  useRouter: () => ({
    push: vi.fn(),
    refresh: refreshMock,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
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
  submitTournamentRegistration: submitTournamentRegistrationMock,
}));

import {
  RegisterModal,
  getVerifiedDivisionBracketName,
  isRegistrationWaitlistOnlyForDivision,
  type RelicVerifiedDivision,
} from "@/components/TournamentsExperience";

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";

const profile = {
  display_name: "Safe Player",
  in_game_name: "Safe IGN",
  discord_username: "safe-discord",
  steam_username: "Safe Steam",
  country: "Australia",
  region: "OCE",
  timezone: "Australia/Sydney",
  profile_completed: true,
};

const brackets = [
  {
    id: "22222222-2222-4222-8222-222222222221",
    name: "Academy Bracket",
    requirement: "Below 1100 ELO",
    maxPlayers: "Max 8",
    registeredPlayers: 0,
    activeCohortPlayers: 0,
    activeCohortSize: 8,
    waitlistedPlayers: 0,
    isFull: false,
    isWaitlistOnly: false,
    prize: "Academy division",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Challenge Bracket",
    requirement: "1100-1399 ELO",
    maxPlayers: "Max 8",
    registeredPlayers: 0,
    activeCohortPlayers: 0,
    activeCohortSize: 8,
    waitlistedPlayers: 0,
    isFull: false,
    isWaitlistOnly: false,
    prize: "Challenge division",
  },
  {
    id: "22222222-2222-4222-8222-222222222223",
    name: "Main / Elite Bracket",
    requirement: "1400+ ELO",
    maxPlayers: "Max 8",
    registeredPlayers: 0,
    activeCohortPlayers: 0,
    activeCohortSize: 8,
    waitlistedPlayers: 0,
    isFull: false,
    isWaitlistOnly: false,
    prize: "Main division",
  },
] satisfies TournamentCard["brackets"];

const tournament: TournamentCard = {
  id: TOURNAMENT_ID,
  slug: "safe-tournament",
  title: "Safe Tournament",
  month: "August 2026",
  format: "1v1",
  ruleFormat: "format_a",
  ruleFormatLabel: "Format A",
  status: "Open",
  statusValue: "registration_open",
  image: "/images/tournaments/1v1-operation-skyfall.jpeg",
  description: "Safe tournament description.",
  organizer: "IronClad Tournaments",
  game: "Company of Heroes 3",
  region: "Global",
  time: "August 2026",
  prizePool: "",
  players: 0,
  maxPlayers: 24,
  brackets,
  details: "Safe details",
  rules: "Safe rules",
  schedule: [],
  contact: "Safe contact",
  registrationEnabled: true,
  registrationOpenAt: "2026-01-01T00:00:00.000Z",
  registrationCloseAt: "2026-12-31T23:59:59.000Z",
  grandFinalAt: "2026-08-21T00:00:00.000Z",
  createdAt: "2026-08-05T00:00:00.000Z",
  resultConfirmationWindowMinutes: 30,
  rulesUrl: null,
  battlefyUrl: null,
  participants: [],
  bracketParticipants: [],
  generatedBrackets: [],
};

function renderModal(verifiedDivision: RelicVerifiedDivision | null) {
  return render(
    <RegisterModal
      profile={profile}
      tournaments={[tournament]}
      initialTournamentId={TOURNAMENT_ID}
      verifiedDivision={verifiedDivision}
      onClose={vi.fn()}
    />
  );
}

function getBracketButton(name: string) {
  return screen.getByRole("button", {
    name: new RegExp(`^${name.replace("/", "\\/")}`),
  });
}

describe("Relic verified-division registration UI", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    submitTournamentRegistrationMock.mockReset();
    submitTournamentRegistrationMock.mockResolvedValue({
      success: true,
      message: "Registration submitted.",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("derives waitlist intake from the viewer's verified division", () => {
    const divisionTournament: TournamentCard = {
      ...tournament,
      brackets: tournament.brackets.map((bracket) => ({
        ...bracket,
        isFull: bracket.name === "Challenge Bracket",
        isWaitlistOnly: bracket.name === "Challenge Bracket",
      })),
    };

    expect(
      isRegistrationWaitlistOnlyForDivision(
        divisionTournament,
        "Challenge"
      )
    ).toBe(true);
    expect(
      isRegistrationWaitlistOnlyForDivision(divisionTournament, "Academy")
    ).toBe(false);
    expect(
      isRegistrationWaitlistOnlyForDivision(divisionTournament, null)
    ).toBe(false);
  });

  it.each([
    ["Academy", "Academy Bracket"],
    ["Challenge", "Challenge Bracket"],
    ["Main / Pro", "Main / Elite Bracket"],
  ] as const)(
    "enables and automatically selects only the %s division bracket",
    (verifiedDivision, expectedBracket) => {
      renderModal(verifiedDivision);

      expect(getVerifiedDivisionBracketName(verifiedDivision)).toBe(
        expectedBracket
      );

      for (const bracket of brackets) {
        const button = getBracketButton(bracket.name);
        const isExpected = bracket.name === expectedBracket;

        if (isExpected) {
          expect(button).toBeEnabled();
          expect(button).toHaveAttribute("aria-disabled", "false");
          expect(button).toHaveAttribute("aria-pressed", "true");
          expect(
            within(button).getByText("Your verified division")
          ).toBeInTheDocument();
        } else {
          expect(button).toBeDisabled();
          expect(button).toHaveAttribute("aria-disabled", "true");
          expect(button).toHaveAttribute("aria-pressed", "false");
          expect(button).toHaveClass("grayscale", "opacity-45");
          expect(
            within(button).getByText(
              "Unavailable for your verified division"
            )
          ).toBeInTheDocument();
        }
      }
    }
  );

  it("rejects a disabled bracket even when its click is forced programmatically", () => {
    renderModal("Challenge");
    const challengeButton = getBracketButton("Challenge Bracket");
    const mainButton = getBracketButton("Main / Elite Bracket");

    mainButton.removeAttribute("disabled");
    fireEvent.click(mainButton);

    expect(challengeButton).toHaveAttribute("aria-pressed", "true");
    expect(mainButton).toHaveAttribute("aria-pressed", "false");
  });

  it("blocks every bracket and submission when no verified division exists", () => {
    renderModal(null);

    for (const bracket of brackets) {
      expect(getBracketButton(bracket.name)).toBeDisabled();
    }

    expect(
      screen.getByText(
        "Verify your ELO from the Profile page before registering."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Profile" })).toHaveAttribute(
      "href",
      "/profile"
    );
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    continueButton.removeAttribute("disabled");
    fireEvent.click(continueButton);

    expect(
      screen.getByRole("heading", { name: "Tournament Selection" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Player Profile Confirmation" })
    ).not.toBeInTheDocument();
    expect(submitTournamentRegistrationMock).not.toHaveBeenCalled();
  });

  it("preserves the successful flow for the verified bracket", async () => {
    renderModal("Challenge");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Player Profile Confirmation" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    for (const agreement of [
      "Rulebook Agreement",
      "Player Participation Agreement",
      "Admin Final Decision Agreement",
      "Ownership Confirmation",
    ]) {
      fireEvent.click(screen.getByRole("checkbox", { name: agreement }));
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Submit Registration" })
    );

    await waitFor(() => {
      expect(submitTournamentRegistrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          bracketId: brackets[1].id,
          bracketName: "Challenge Bracket",
          tournamentId: TOURNAMENT_ID,
        })
      );
    });
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("does not use current ELO, CoH3Stats, or a player-card URL for selection", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/TournamentsExperience.tsx"),
      "utf8"
    );

    expect(source).not.toContain("current_elo");
    expect(source.toLowerCase()).not.toContain("coh3stats");
    expect(source).not.toContain("coh3_player_card_url");
  });
});

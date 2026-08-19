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
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { translate } from "@/lib/i18n/translate";
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
  getRegistrationDivisionAvailability,
  getViewerRegistrationDisplay,
  getVerifiedDivisionBracketName,
  isRegistrationWaitlistOnlyForDivision,
  type RelicVerifiedDivision,
  type TournamentViewerRegistration,
} from "@/components/TournamentsExperience";

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const EFFECTIVE_DATE = "2026-08-18T00:00:00.000+10:00";
const DOCUMENT_SHA256 = "a".repeat(64);
const registrationDocuments = {
  rulebook: {
    id: "77777777-7777-4777-8777-777777777771",
    kind: "rulebook" as const,
    version: "fixture-rulebook-v1",
    url: "https://example.test/legal/rulebook/fixture-v1",
    effectiveDate: EFFECTIVE_DATE,
    sha256: DOCUMENT_SHA256,
  },
  ppa: {
    id: "77777777-7777-4777-8777-777777777772",
    kind: "ppa" as const,
    version: "fixture-ppa-v1",
    url: "https://example.test/legal/ppa/fixture-v1",
    effectiveDate: EFFECTIVE_DATE,
    sha256: DOCUMENT_SHA256,
  },
  terms: {
    id: "77777777-7777-4777-8777-777777777773",
    kind: "terms" as const,
    version: "fixture-terms-v1",
    url: "https://example.test/legal/terms/fixture-v1",
    effectiveDate: EFFECTIVE_DATE,
    sha256: DOCUMENT_SHA256,
  },
  privacy: {
    id: "77777777-7777-4777-8777-777777777774",
    kind: "privacy" as const,
    version: "fixture-privacy-v1",
    url: "https://example.test/legal/privacy/fixture-v1",
    effectiveDate: EFFECTIVE_DATE,
    sha256: DOCUMENT_SHA256,
  },
};

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
    launchedAt: null,
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
    launchedAt: null,
    prize: "Challenge division",
  },
  {
    id: "22222222-2222-4222-8222-222222222223",
    name: "Main / Pro Bracket",
    requirement: "1400+ ELO",
    maxPlayers: "Max 8",
    registeredPlayers: 0,
    activeCohortPlayers: 0,
    activeCohortSize: 8,
    waitlistedPlayers: 0,
    isFull: false,
    isWaitlistOnly: false,
    launchedAt: null,
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
  mapPools: [],
};

const waitlistedRegistration: TournamentViewerRegistration = {
  id: "33333333-3333-4333-8333-333333333333",
  tournamentId: TOURNAMENT_ID,
  tournamentBracketId: brackets[1].id,
  bracketName: "Challenge Bracket",
  status: "waitlisted",
  createdAt: "2026-08-05T10:00:00.000Z",
  waitlistPosition: 1,
  waitlistOfferStatus: null,
};

function renderModal(
  verifiedDivision: RelicVerifiedDivision | null,
  selectedTournament = tournament
) {
  return render(
    <RegisterModal
      profile={profile}
      tournaments={[selectedTournament]}
      initialTournamentId={selectedTournament.id}
      verifiedDivision={verifiedDivision}
      registrationDocuments={registrationDocuments}
      onClose={vi.fn()}
    />
  );
}

function getBracketButton(name: string) {
  return screen.getByRole("button", {
    name: new RegExp(`^${name.replace("/", "\\/")}`),
  });
}

function advanceToAgreements() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const agreement of screen.getAllByRole("checkbox")) {
    fireEvent.click(agreement);
  }
}

describe("Relic verified-division registration UI", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    submitTournamentRegistrationMock.mockReset();
    submitTournamentRegistrationMock.mockResolvedValue({
      success: true,
      code: "REGISTRATION_SUBMITTED",
      message: "Registration submitted.",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("presents six explicit controls with exact versioned document links", () => {
    renderModal("Challenge");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(
      screen.getByRole("link", {
        name: "Player Participation Agreement (version fixture-ppa-v1) (opens in a new tab)",
      })
    ).toHaveAttribute("href", registrationDocuments.ppa.url);
    expect(
      screen.getByRole("link", {
        name: "Official Tournament Rulebook (version fixture-rulebook-v1) (opens in a new tab)",
      })
    ).toHaveAttribute("href", registrationDocuments.rulebook.url);
    expect(
      screen.getByRole("link", {
        name: "Terms of Service (version fixture-terms-v1) (opens in a new tab)",
      })
    ).toHaveAttribute("href", registrationDocuments.terms.url);
    expect(
      screen.getByRole("link", {
        name: "Privacy Policy (version fixture-privacy-v1) (opens in a new tab)",
      })
    ).toHaveAttribute("href", registrationDocuments.privacy.url);
    expect(
      screen.getAllByText(
        translate(competitionEnglish, "registrationServer.documentEffective", {
          date: "August 18, 2026",
          sha256: "aaaaaaaaaaaa…",
        })
      )
    ).toHaveLength(4);
    expect(screen.getAllByText(/SHA-256 a{12}…/)).toHaveLength(4);
    expect(
      screen.getByRole("checkbox", {
        name: "I confirm that I am at least 18 years old.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /linked Steam account belongs to me/i,
      })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Admin Final Decision/i)).not.toBeInTheDocument();
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

  it("keeps sibling divisions open after one division launches", () => {
    const partiallyLaunched: TournamentCard = {
      ...tournament,
      status: "In Progress",
      statusValue: "in_progress",
      brackets: tournament.brackets.map((bracket) => ({
        ...bracket,
        launchedAt:
          bracket.name === "Challenge Bracket"
            ? "2026-08-06T02:00:00.000Z"
            : null,
      })),
    };

    expect(
      getRegistrationDivisionAvailability(partiallyLaunched, "Challenge")
    ).toBe("launched");
    expect(
      getRegistrationDivisionAvailability(partiallyLaunched, "Academy")
    ).toBe("open");
  });

  it("shows a closed state for never-offered waitlist history after division launch", () => {
    const launchedTournament: TournamentCard = {
      ...tournament,
      brackets: tournament.brackets.map((bracket) => ({
        ...bracket,
        launchedAt:
          bracket.id === waitlistedRegistration.tournamentBracketId
            ? "2026-08-06T02:00:00.000Z"
            : null,
      })),
    };

    expect(
      getViewerRegistrationDisplay(
        launchedTournament,
        waitlistedRegistration
      )
    ).toMatchObject({
      title: "Waitlist Closed",
      tone: "neutral",
    });
  });

  it.each([
    ["declined", "Waitlist Offer Declined"],
    ["expired", "Waitlist Offer Expired"],
    ["cancelled", "Waitlist Offer Cancelled"],
  ] as const)(
    "shows terminal %s offer history instead of an active waitlist state",
    (waitlistOfferStatus, title) => {
      const display = getViewerRegistrationDisplay(tournament, {
        ...waitlistedRegistration,
        waitlistOfferStatus,
      });

      expect(display).toMatchObject({ title, tone: "neutral" });
      expect(display.description).not.toContain(
        "currently on the waitlist"
      );
    }
  );

  it.each([
    ["Academy", "Academy Bracket"],
    ["Challenge", "Challenge Bracket"],
    ["Main / Pro", "Main / Pro Bracket"],
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
            within(button).getByText(
              competitionEnglish.registrationModal.verifiedDivision
            )
          ).toBeInTheDocument();
        } else {
          expect(button).toBeDisabled();
          expect(button).toHaveAttribute("aria-disabled", "true");
          expect(button).toHaveAttribute("aria-pressed", "false");
          expect(button).toHaveClass("grayscale", "opacity-45");
          expect(
            within(button).getByText(
              competitionEnglish.registrationModal.unavailableForDivision
            )
          ).toBeInTheDocument();
        }
      }
    }
  );

  it("rejects a disabled bracket even when its click is forced programmatically", () => {
    renderModal("Challenge");
    const challengeButton = getBracketButton("Challenge Bracket");
    const mainButton = getBracketButton("Main / Pro Bracket");

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
    advanceToAgreements();
    fireEvent.click(
      screen.getByRole("button", { name: "Submit Registration" })
    );

    await waitFor(() => {
      expect(submitTournamentRegistrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          bracketId: brackets[1].id,
          bracketName: "Challenge Bracket",
          tournamentId: TOURNAMENT_ID,
          waitlistConfirmed: false,
        })
      );
    });
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("shows the complete warning and waitlist-specific final action", async () => {
    const waitlistTournament: TournamentCard = {
      ...tournament,
      brackets: tournament.brackets.map((bracket) =>
        bracket.name === "Challenge Bracket"
          ? {
              ...bracket,
              activeCohortPlayers: 8,
              isFull: true,
              isWaitlistOnly: true,
            }
          : bracket
      ),
    };
    renderModal("Challenge", waitlistTournament);
    advanceToAgreements();

    expect(
      screen.getByText(competitionEnglish.registrationServer.waitlistConfirmation)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join Waitlist" }));

    await waitFor(() => {
      expect(submitTournamentRegistrationMock).toHaveBeenCalledWith(
        expect.objectContaining({ waitlistConfirmed: true })
      );
    });
  });

  it("requires a second deliberate action when a capacity race creates a waitlist", async () => {
    submitTournamentRegistrationMock
      .mockResolvedValueOnce({
        success: false,
        code: "WAITLIST_CONFIRMATION_REQUIRED",
        message: "Stale server wording must not drive player-facing copy.",
        requiresWaitlistConfirmation: true,
      })
      .mockResolvedValueOnce({
        success: true,
        code: "WAITLIST_SUBMITTED",
        values: { position: 1 },
        message: "Registration submitted to waitlist position #1.",
      });
    renderModal("Challenge");
    advanceToAgreements();

    fireEvent.click(
      screen.getByRole("button", { name: "Submit Registration" })
    );

    await waitFor(() => {
      expect(submitTournamentRegistrationMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ waitlistConfirmed: false })
      );
    });
    expect(refreshMock).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(
        competitionEnglish.registrationServer.waitlistConfirmation
      )
    ).toHaveLength(2);
    expect(
      screen.queryByText("Stale server wording must not drive player-facing copy.")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Join Waitlist" }));

    await waitFor(() => {
      expect(submitTournamentRegistrationMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ waitlistConfirmed: true })
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

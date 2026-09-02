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
  type RegistrationPresentation,
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
  divisionStates: [],
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

const alternateTournament: TournamentCard = {
  ...tournament,
  id: "11111111-1111-4111-8111-111111111112",
  slug: "alternate-safe-tournament",
  title: "Alternate Safe Tournament",
  description: "Alternate safe tournament description.",
  brackets: tournament.brackets.map((bracket, index) => ({
    ...bracket,
    id: `22222222-2222-4222-8222-22222222223${index}`,
  })),
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
  selectedTournament = tournament,
  {
    presentation = "desktop",
    onClose = vi.fn(),
    availableTournaments = [selectedTournament],
    viewerRegistrations = [],
  }: {
    presentation?: RegistrationPresentation;
    onClose?: () => void;
    availableTournaments?: TournamentCard[];
    viewerRegistrations?: TournamentViewerRegistration[];
  } = {}
) {
  return render(
    <RegisterModal
      profile={profile}
      tournaments={availableTournaments}
      initialTournamentId={selectedTournament.id}
      verifiedDivision={verifiedDivision}
      registrationDocuments={registrationDocuments}
      viewerRegistrations={viewerRegistrations}
      presentation={presentation}
      onClose={onClose}
    />
  );
}

function getBracketButton(name: string) {
  return screen.getByRole("button", {
    name: new RegExp(`^${name.replace("/", "\\/")}`),
  });
}

function advanceToAgreementStep() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function acceptAllAgreements() {
  for (const agreement of screen.getAllByRole("checkbox")) {
    fireEvent.click(agreement);
  }
}

function advanceToAgreements() {
  advanceToAgreementStep();
  acceptAllAgreements();
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

  it("exposes a named, described modal with progress and a phone-safe scroll shell", () => {
    renderModal("Challenge", tournament, { presentation: "phone" });

    const dialog = screen.getByRole("dialog", {
      name: competitionEnglish.registrationModal.title,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-busy", "false");
    expect(dialog).toHaveAccessibleDescription(
      competitionEnglish.registrationModal.dialogDescription
    );
    expect(dialog).toHaveClass("h-[100dvh]", "overflow-hidden");
    expect(dialog.querySelector(".overflow-y-auto")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overscroll-contain"
    );

    const progress = screen.getByRole("progressbar", {
      name: "Step 1 of 4",
    });
    expect(progress).toHaveAttribute("aria-valuemin", "1");
    expect(progress).toHaveAttribute("aria-valuemax", "4");
    expect(progress).toHaveAttribute("aria-valuenow", "1");

    const footer = dialog.querySelector(
      '[data-registration-action-footer="persistent"]'
    );
    expect(footer).toHaveClass(
      "shrink-0",
      "[padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]"
    );
    expect(
      within(footer as HTMLElement).getByRole("button", { name: "Continue" })
    ).toHaveClass("min-h-11");
  });

  it("uses a compact phone Tournament summary and reveals only eligible Tournament choices", () => {
    renderModal("Challenge", tournament, {
      presentation: "phone",
      availableTournaments: [tournament, alternateTournament],
    });

    const phoneStep = document.querySelector(
      '[data-registration-phone-step="tournament"]'
    );
    expect(phoneStep).not.toBeNull();
    const selectedSummary = within(phoneStep as HTMLElement).getByRole(
      "region",
      { name: competitionEnglish.registrationModal.selectedTournament }
    );
    expect(within(selectedSummary).getByText(tournament.title)).toBeInTheDocument();
    expect(within(selectedSummary).getByText("Challenge Bracket")).toBeInTheDocument();
    expect(within(selectedSummary).getByText(/0\/8/)).toBeInTheDocument();

    for (const sibling of ["Academy Bracket", "Main / Pro Bracket"]) {
      expect(
        within(phoneStep as HTMLElement).queryByRole("button", {
          name: new RegExp(`^${sibling.replace("/", "\\/")}`),
        })
      ).not.toBeInTheDocument();
    }

    const changeTournament = within(phoneStep as HTMLElement).getByRole(
      "button",
      { name: competitionEnglish.registrationModal.changeTournament }
    );
    expect(changeTournament).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(changeTournament);
    expect(changeTournament).toHaveAttribute("aria-expanded", "true");

    const choices = document.getElementById("registration-tournament-choices");
    expect(choices).not.toBeNull();
    expect(
      within(choices as HTMLElement).getByRole("button", {
        name: new RegExp(`^${tournament.title}`),
      })
    ).toBeInTheDocument();
    fireEvent.click(
      within(choices as HTMLElement).getByRole("button", {
        name: new RegExp(`^${alternateTournament.title}`),
      })
    );

    expect(
      within(selectedSummary).getByText(alternateTournament.title)
    ).toBeInTheDocument();
    expect(
      document.getElementById("registration-tournament-choices")
    ).not.toBeInTheDocument();
  });

  it("renders only eligible Tournaments in desktop selection and preserves mobile filtering", () => {
    const completedTournament: TournamentCard = {
      ...alternateTournament,
      id: "11111111-1111-4111-8111-111111111113",
      slug: "completed-tournament",
      title: "Completed Historical Tournament",
      status: "Completed",
      statusValue: "completed",
      registrationEnabled: false,
    };
    const closedTournament: TournamentCard = {
      ...alternateTournament,
      id: "11111111-1111-4111-8111-111111111114",
      slug: "closed-tournament",
      title: "Closed Registration Tournament",
      registrationEnabled: false,
    };
    const voidedTournament: TournamentCard = {
      ...alternateTournament,
      id: "11111111-1111-4111-8111-111111111115",
      slug: "voided-tournament",
      title: "Voided Tournament",
      status: "Voided",
      statusValue: "voided",
      registrationEnabled: false,
    };
    const availableTournaments = [
      tournament,
      alternateTournament,
      completedTournament,
      closedTournament,
      voidedTournament,
    ];

    const desktopView = renderModal("Challenge", tournament, {
      availableTournaments,
    });

    expect(screen.getAllByText("Safe Tournament").length).toBeGreaterThan(0);
    expect(screen.getByText("Alternate Safe Tournament")).toBeInTheDocument();
    expect(
      screen.queryByText("Completed Historical Tournament")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Closed Registration Tournament")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Voided Tournament")).not.toBeInTheDocument();

    desktopView.unmount();

    renderModal("Challenge", tournament, {
      availableTournaments,
      presentation: "phone",
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: competitionEnglish.registrationModal.changeTournament,
      })
    );

    expect(screen.getByText("Alternate Safe Tournament")).toBeInTheDocument();
    expect(
      screen.queryByText("Completed Historical Tournament")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Closed Registration Tournament")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Voided Tournament")).not.toBeInTheDocument();
  });

  it("shows open registration for an unlaunched division in a partially launched Tournament", () => {
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

    renderModal("Academy", partiallyLaunched, { presentation: "phone" });

    const selectedSummary = within(
      document.querySelector(
        '[data-registration-phone-step="tournament"]'
      ) as HTMLElement
    ).getByRole("region", {
      name: competitionEnglish.registrationModal.selectedTournament,
    });
    expect(
      within(selectedSummary).getByText(
        competitionEnglish.tournaments.status.open
      )
    ).toBeInTheDocument();
    expect(
      within(selectedSummary).queryByText("In Progress")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("shows compact Player readiness with a closed saved-details disclosure", () => {
    renderModal("Challenge", tournament, { presentation: "phone" });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const readiness = document.querySelector(
      '[data-registration-phone-step="readiness"]'
    );
    expect(readiness).not.toBeNull();
    expect(
      within(readiness as HTMLElement).getByText(
        competitionEnglish.registrationModal.profileReady
      )
    ).toBeInTheDocument();
    expect(
      within(readiness as HTMLElement).getByText(
        competitionEnglish.registrationModal.steamConnected
      )
    ).toBeInTheDocument();
    expect(
      within(readiness as HTMLElement).getByText(
        /Your verified Division: Challenge Bracket/
      )
    ).toBeInTheDocument();
    expect(
      within(readiness as HTMLElement).getByText(
        competitionEnglish.registrationModal.relicVerificationOnSubmit
      )
    ).toBeInTheDocument();

    const disclosureLabel = within(readiness as HTMLElement).getByText(
      competitionEnglish.registrationModal.reviewSavedDetails
    );
    const disclosure = disclosureLabel.closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    expect(within(disclosure as HTMLElement).getByText(profile.display_name)).toBeInTheDocument();
    expect(within(disclosure as HTMLElement).getByText(profile.steam_username)).toBeInTheDocument();
    expect(within(readiness as HTMLElement).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("locks missing verified-Division readiness to the safe Profile action on phone", () => {
    renderModal(null, tournament, { presentation: "phone" });

    const phoneStep = document.querySelector(
      '[data-registration-phone-step="tournament"]'
    );
    expect(phoneStep).not.toBeNull();
    expect(
      within(phoneStep as HTMLElement).getByText(
        competitionEnglish.registrationModal.errors.verifiedDivisionRequired
      )
    ).toBeInTheDocument();
    expect(
      within(phoneStep as HTMLElement).getByRole("link", {
        name: competitionEnglish.tournaments.actions.openProfile,
      })
    ).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(submitTournamentRegistrationMock).not.toHaveBeenCalled();
  });

  it("associates every required agreement with its localized validation error", async () => {
    renderModal("Challenge", tournament, { presentation: "phone" });
    advanceToAgreementStep();

    const register = screen.getByRole("button", { name: "Register" });
    expect(register).toHaveClass("min-h-11");
    fireEvent.click(register);

    const agreements = screen.getAllByRole("checkbox");
    expect(agreements).toHaveLength(6);
    for (const agreement of agreements) {
      expect(agreement).toHaveAttribute("aria-invalid", "true");
      const errorId = agreement.getAttribute("aria-describedby");
      expect(errorId).toBeTruthy();
      const error = document.getElementById(errorId as string);
      expect(error).toHaveAttribute("role", "alert");
      expect(error).not.toHaveTextContent(/^\s*$/);
    }
    await waitFor(() => expect(agreements[0]).toHaveFocus());
    expect(submitTournamentRegistrationMock).not.toHaveBeenCalled();
  });

  it("focuses the close control, traps focus, restores the opener, and locks body scroll", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open registration";
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = renderModal("Challenge", tournament, {
      presentation: "phone",
      onClose,
    });

    const close = screen.getByRole("button", {
      name: competitionEnglish.registrationModal.closeAria,
    });
    await waitFor(() => expect(close).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");

    const continueButton = screen.getByRole("button", { name: "Continue" });
    continueButton.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(continueButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("keeps a pending submission busy, single-shot, and non-dismissible", async () => {
    let resolveSubmission!: (result: {
      success: boolean;
      code: "REGISTRATION_SUBMITTED";
      message: string;
    }) => void;
    submitTournamentRegistrationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        })
    );
    const onClose = vi.fn();
    renderModal("Challenge", tournament, {
      presentation: "phone",
      onClose,
    });
    advanceToAgreements();

    const register = screen.getByRole("button", { name: "Register" });
    register.focus();
    fireEvent.click(register);
    fireEvent.click(register);

    const dialog = screen.getByRole("dialog", {
      name: competitionEnglish.registrationModal.title,
    });
    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "true"));
    expect(submitTournamentRegistrationMock).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", {
        name: competitionEnglish.registrationModal.closeAria,
      })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: competitionEnglish.registrationModal.submitting,
      })
    ).toBeDisabled();

    const firstPendingFocusable = screen.getAllByRole("checkbox")[0];
    fireEvent.keyDown(window, { key: "Tab" });
    expect(firstPendingFocusable).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    resolveSubmission({
      success: true,
      code: "REGISTRATION_SUBMITTED",
      message: "Registration submitted.",
    });
    await screen.findByRole("status");
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
    renderModal("Challenge", tournament, { presentation: "phone" });
    advanceToAgreements();
    const footer = document.querySelector(
      '[data-registration-action-footer="persistent"]'
    );
    expect(footer).not.toBeNull();
    fireEvent.click(
      within(footer as HTMLElement).getByRole("button", { name: "Register" })
    );

    await waitFor(() => {
      expect(submitTournamentRegistrationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountAndSteamOwnershipConfirmation: true,
          age18Confirmation: true,
          bracketId: brackets[1].id,
          bracketName: "Challenge Bracket",
          playerParticipationAgreement: true,
          ppaDocumentId: registrationDocuments.ppa.id,
          privacyAcknowledgement: true,
          privacyDocumentId: registrationDocuments.privacy.id,
          rulebookAgreement: true,
          rulebookDocumentId: registrationDocuments.rulebook.id,
          termsAgreement: true,
          termsDocumentId: registrationDocuments.terms.id,
          tournamentId: TOURNAMENT_ID,
          waitlistConfirmed: false,
        })
      );
    });
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("shows normal submission as Pending Admin review without a fixed review time", async () => {
    renderModal("Challenge", tournament, { presentation: "phone" });
    advanceToAgreements();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    const outcome = await screen.findByRole("status");
    expect(
      within(outcome).getByRole("heading", {
        name: competitionEnglish.registrationModal.submittedTitle,
      })
    ).toBeInTheDocument();
    expect(
      within(outcome).getByText(
        competitionEnglish.registrationModal.pendingAdminReview
      )
    ).toBeInTheDocument();
    expect(
      within(outcome).getByRole("heading", {
        name: competitionEnglish.registrationModal.whatHappensNext,
      })
    ).toBeInTheDocument();
    const stages = outcome.querySelector(
      "[data-registration-success-stages]"
    );
    expect(stages).not.toBeNull();
    for (const label of [
      competitionEnglish.registrationGuidance.adminReviewTitle,
      competitionEnglish.registrationGuidance.approvalTitle,
      competitionEnglish.registrationModal.eightApprovedPlayers,
      competitionEnglish.registrationModal.divisionLaunch,
    ]) {
      expect(within(stages as HTMLElement).getByText(label)).toBeInTheDocument();
    }
    expect(
      within(outcome).getByText(competitionEnglish.registrationModal.reviewTime)
    ).toBeInTheDocument();
    expect(
      within(outcome).getByText(
        competitionEnglish.registrationModal.successGuidance
      )
    ).toBeInTheDocument();
    const matchTiming = outcome.querySelector(
      "[data-registration-match-timing]"
    );
    expect(matchTiming).not.toBeNull();
    expect(matchTiming).toHaveTextContent(
      competitionEnglish.registrationModal.matchTimingTitle
    );
    expect(matchTiming).toHaveTextContent(/matchup becomes active/i);
    expect(matchTiming).toHaveTextContent(/7 days/i);
    expect(matchTiming).not.toHaveTextContent(/9 days/i);
    expect(matchTiming).not.toHaveTextContent(/extension/i);
    expect(
      screen.getByRole("link", {
        name: competitionEnglish.registrationModal.openDashboard,
      })
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.getByRole("button", {
        name: competitionEnglish.tournaments.actions.close,
      })
    ).toBeInTheDocument();
    const submittedFooter = document.querySelector(
      '[data-registration-action-footer="persistent"]'
    );
    expect(submittedFooter).toHaveClass(
      "shrink-0",
      "[padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]"
    );
    expect(
      within(submittedFooter as HTMLElement).getByRole("link", {
        name: competitionEnglish.registrationModal.openDashboard,
      })
    ).toHaveClass("min-h-11");
    expect(
      within(submittedFooter as HTMLElement).getByRole("button", {
        name: competitionEnglish.tournaments.actions.close,
      })
    ).toHaveClass("min-h-11");
    expect(within(outcome).queryByText(/24\s*hours/i)).not.toBeInTheDocument();
    expect(
      within(outcome).queryByText(
        competitionEnglish.registrationModal.waitlistResultDescription
      )
    ).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "4"
    );
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
    renderModal("Challenge", waitlistTournament, { presentation: "phone" });
    advanceToAgreements();

    expect(
      screen.getByText(competitionEnglish.registrationServer.waitlistConfirmation)
    ).toBeInTheDocument();
    const footer = document.querySelector(
      '[data-registration-action-footer="persistent"]'
    );
    expect(footer).toHaveClass(
      "[padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]"
    );
    fireEvent.click(
      within(footer as HTMLElement).getByRole("button", {
        name: "Join Waitlist",
      })
    );

    await waitFor(() => {
      expect(submitTournamentRegistrationMock).toHaveBeenCalledWith(
        expect.objectContaining({ waitlistConfirmed: true })
      );
    });
  });

  it("shows a distinct waitlist outcome with exact position, FIFO, and Dashboard guidance", async () => {
    submitTournamentRegistrationMock.mockResolvedValueOnce({
      success: true,
      code: "WAITLIST_SUBMITTED",
      values: { position: 4 },
      message: "Registration submitted to waitlist position #4.",
    });
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
    renderModal("Challenge", waitlistTournament, { presentation: "phone" });
    advanceToAgreements();
    fireEvent.click(screen.getByRole("button", { name: "Join Waitlist" }));

    const outcome = await screen.findByRole("status");
    expect(
      within(outcome).getByRole("heading", {
        name: competitionEnglish.registrationModal.waitlistJoinedTitle,
      })
    ).toBeInTheDocument();
    expect(within(outcome).getByText(/#4/)).toBeInTheDocument();
    expect(
      within(outcome).getByText(
        competitionEnglish.registrationModal.waitlistResultDescription
      )
    ).toBeInTheDocument();
    expect(outcome).toHaveTextContent(/not guaranteed/i);
    expect(outcome).toHaveTextContent(/first-in, first-out/i);
    expect(outcome).toHaveTextContent(/Dashboard/i);
    expect(outcome).toHaveTextContent(/returns your Registration to Admin Review/i);
    expect(outcome).toHaveTextContent(/does not guarantee approval/i);
    expect(outcome).not.toHaveTextContent(/7 days/i);
    expect(outcome).not.toHaveTextContent(/matchup becomes active/i);
    expect(
      within(outcome).queryByText(competitionEnglish.registrationModal.reviewTime)
    ).not.toBeInTheDocument();
    expect(
      within(outcome).queryByText(competitionEnglish.registrationModal.submittedTitle)
    ).not.toBeInTheDocument();
    expect(
      within(outcome).queryByText(
        competitionEnglish.registrationModal.whatHappensNext
      )
    ).not.toBeInTheDocument();
    expect(
      outcome.querySelector("[data-registration-match-timing]")
    ).toBeNull();
    expect(
      within(outcome).getByText(
        competitionEnglish.registrationModal.waitlistNoAction
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: competitionEnglish.registrationModal.openDashboard,
      })
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.getByRole("button", {
        name: competitionEnglish.tournaments.actions.close,
      })
    ).toBeInTheDocument();
  });

  it("uses the refreshed authoritative waitlist position when the action omits it", async () => {
    submitTournamentRegistrationMock.mockResolvedValueOnce({
      success: true,
      code: "WAITLIST_SUBMITTED",
      message: "Registration submitted to the waitlist.",
    });
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
    renderModal("Challenge", waitlistTournament, {
      presentation: "phone",
      viewerRegistrations: [
        {
          ...waitlistedRegistration,
          waitlistPosition: 7,
        },
      ],
    });
    advanceToAgreements();
    fireEvent.click(screen.getByRole("button", { name: "Join Waitlist" }));

    const outcome = await screen.findByRole("status");
    expect(within(outcome).getByText(/#7/)).toBeInTheDocument();
    expect(
      within(outcome).queryByText(
        competitionEnglish.registrationModal.waitlistPositionPending
      )
    ).not.toBeInTheDocument();
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
    ).toHaveLength(1);
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

  it("keeps Registration guidance beside both actionable Hero cards", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/TournamentsExperience.tsx"),
      "utf8"
    );
    const siblingPlacements = source.match(
      /<ActionCard[\s\S]*?\/>\s*\{registrationOpen && <RegistrationGuidanceDisclosure \/>\}/g
    );

    expect(siblingPlacements).toHaveLength(2);
    expect(source).toContain(
      'import RegistrationGuidanceDisclosure from "@/components/RegistrationGuidanceDisclosure";'
    );
  });
});

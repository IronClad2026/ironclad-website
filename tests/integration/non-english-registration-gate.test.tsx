// @vitest-environment jsdom

import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import competitionSpanish from "@/lib/i18n/dictionaries/es/competition";
import competitionItalian from "@/lib/i18n/dictionaries/it/competition";
import type { TournamentCard } from "@/lib/tournaments";

const refreshMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const setLocalePreferenceMock = vi.hoisted(() => vi.fn());
const submitTournamentRegistrationMock = vi.hoisted(() => vi.fn());
const profileMaybeSingleMock = vi.hoisted(() => vi.fn());
const browserClientMock = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: profileMaybeSingleMock,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  return {
    from: vi.fn(() => query),
    query,
  };
});

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn(),
    isSignedIn: true,
    userId: "user_player_123",
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
    replace: replaceMock,
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

vi.mock("@/app/locale-actions", () => ({
  setLocalePreference: setLocalePreferenceMock,
}));

vi.mock("@/app/tournaments/actions", () => ({
  submitTournamentRegistration: submitTournamentRegistrationMock,
}));

vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/supabase-browser", () => ({
  createAuthenticatedBrowserSupabaseClient: vi.fn(() => browserClientMock),
}));

import TournamentsExperience from "@/components/TournamentsExperience";

const TOURNAMENT_URL =
  "/tournaments?tournament=registration-gate-fixture&tab=overview&panel=details#registration-review";
const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const BRACKET_ID = "22222222-2222-4222-8222-222222222222";
const EFFECTIVE_DATE = "2026-08-18T00:00:00.000+10:00";

const registrationDocuments = {
  rulebook: {
    id: "77777777-7777-4777-8777-777777777771",
    kind: "rulebook" as const,
    version: "3.0",
    url: "/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf",
    effectiveDate: EFFECTIVE_DATE,
    sha256:
      "11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0",
  },
  ppa: {
    id: "77777777-7777-4777-8777-777777777772",
    kind: "ppa" as const,
    version: "3.0",
    url: "/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf",
    effectiveDate: EFFECTIVE_DATE,
    sha256:
      "a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600",
  },
  terms: {
    id: "77777777-7777-4777-8777-777777777773",
    kind: "terms" as const,
    version: "1.0",
    url: "/documents-rules-ppa/ironclad-terms-of-service-v1.0.pdf",
    effectiveDate: EFFECTIVE_DATE,
    sha256:
      "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
  },
  privacy: {
    id: "77777777-7777-4777-8777-777777777774",
    kind: "privacy" as const,
    version: "1.0",
    url: "/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf",
    effectiveDate: EFFECTIVE_DATE,
    sha256:
      "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
  },
};

const tournament: TournamentCard = {
  id: TOURNAMENT_ID,
  slug: "registration-gate-fixture",
  title: "Registration Gate Fixture",
  month: "August 2026",
  format: "1v1",
  ruleFormat: "format_a",
  ruleFormatLabel: "Format A",
  status: "Open",
  statusValue: "registration_open",
  image: "/images/tournaments/1v1-operation-skyfall.jpeg",
  description: "Registration gate fixture.",
  organizer: "IronClad Tournaments",
  game: "Company of Heroes 3",
  region: "Global",
  time: "August 2026",
  prizePool: "",
  players: 0,
  maxPlayers: 8,
  brackets: [
    {
      id: BRACKET_ID,
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
  ],
  details: "Registration gate fixture.",
  rules: "Format A rules.",
  schedule: [],
  contact: "IronClad Admin",
  registrationEnabled: true,
  registrationOpenAt: "2026-01-01T00:00:00.000Z",
  registrationCloseAt: "2026-12-31T23:59:59.000Z",
  grandFinalAt: "2026-12-31T23:59:59.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  resultConfirmationWindowMinutes: 30,
  rulesUrl: null,
  battlefyUrl: null,
  participants: [],
  bracketParticipants: [],
  generatedBrackets: [],
  mapPools: [],
};

const viewer = {
  isAdmin: false,
  relicVerifiedDivision: "Challenge" as const,
  registrationIds: [],
  registrations: [],
};

describe("non-English registration gate", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", TOURNAMENT_URL);
    refreshMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    setLocalePreferenceMock.mockReset();
    setLocalePreferenceMock.mockResolvedValue({
      ok: true,
      locale: "en",
      metadataMirror: "updated",
    });
    submitTournamentRegistrationMock.mockReset();
    browserClientMock.from.mockReset();
    browserClientMock.from.mockReturnValue(browserClientMock.query);
    browserClientMock.query.select.mockReset();
    browserClientMock.query.select.mockReturnValue(browserClientMock.query);
    browserClientMock.query.eq.mockReset();
    browserClientMock.query.eq.mockReturnValue(browserClientMock.query);
    profileMaybeSingleMock.mockReset();
    profileMaybeSingleMock.mockResolvedValue({
      data: {
        display_name: "Safe Player",
        in_game_name: "Safe IGN",
        discord_username: "safe-discord",
        steam_username: "Safe Steam",
        country: "Australia",
        region: "OCE",
        timezone: "Australia/Sydney",
        profile_completed: true,
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("presents the existing controlling-English registration gate in Italian", () => {
    renderExperience("it");

    fireEvent.click(
      screen.getAllByRole("button", {
        name: new RegExp(
          `^${competitionItalian.tournaments.actions.register}`
        ),
      })[0]
    );

    expect(
      screen.getByRole("dialog", { name: competitionItalian.gate.title })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: competitionItalian.gate.continueEnglish,
      })
    ).toBeInTheDocument();
    expect(setLocalePreferenceMock).not.toHaveBeenCalled();
    expect(profileMaybeSingleMock).not.toHaveBeenCalled();
  });

  it("cancels without changing locale or beginning registration", () => {
    renderExperience("es");

    fireEvent.click(
      screen.getAllByRole("button", {
        name: new RegExp(
          `^${competitionSpanish.tournaments.actions.register}`
        ),
      })[0]
    );
    expect(
      screen.getByRole("dialog", { name: competitionSpanish.gate.title })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: competitionSpanish.gate.goBack })
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: new RegExp(
          `^${competitionSpanish.tournaments.actions.register}`
        ),
      })
    ).toHaveLength(2);
    expect(setLocalePreferenceMock).not.toHaveBeenCalled();
    expect(profileMaybeSingleMock).not.toHaveBeenCalled();
    expect(submitTournamentRegistrationMock).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe(TOURNAMENT_URL);
  });

  it("continues through a fresh English flow with six unchecked controls", async () => {
    const view = renderExperience("es");

    fireEvent.click(
      screen.getAllByRole("button", {
        name: new RegExp(
          `^${competitionSpanish.tournaments.actions.register}`
        ),
      })[0]
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: competitionSpanish.gate.continueEnglish,
      })
    );

    await waitFor(() => {
      expect(setLocalePreferenceMock).toHaveBeenCalledWith("en");
      expect(profileMaybeSingleMock).toHaveBeenCalledOnce();
      expect(refreshMock).toHaveBeenCalledOnce();
    });

    view.rerender(experience("en"));

    expect(
      screen.getByRole("heading", {
        name: competitionEnglish.registrationModal.tournamentSelection,
      })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: competitionEnglish.registrationModal.continue,
      })
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: competitionEnglish.registrationModal.continue,
      })
    );

    const controls = screen.getAllByRole("checkbox");
    expect(controls).toHaveLength(6);
    for (const control of controls) {
      expect(control).not.toBeChecked();
    }

    const documentLinks = [
      ["Official Tournament Rulebook", registrationDocuments.rulebook],
      ["Player Participation Agreement", registrationDocuments.ppa],
      ["Terms of Service", registrationDocuments.terms],
      ["Privacy Policy", registrationDocuments.privacy],
    ] as const;
    for (const [label, document] of documentLinks) {
      expect(
        screen.getByRole("link", {
          name: `${label} (version ${document.version}) (opens in a new tab)`,
        })
      ).toHaveAttribute("href", document.url);
    }

    expect(submitTournamentRegistrationMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe(TOURNAMENT_URL);
  });
});

function renderExperience(locale: "en" | "es" | "it") {
  return render(experience(locale));
}

function experience(locale: "en" | "es" | "it") {
  return (
    <LocaleProvider
      locale={locale}
      dictionaries={{
        competition:
          locale === "en"
            ? competitionEnglish
            : locale === "it"
              ? competitionItalian
              : competitionSpanish,
      }}
    >
      <TournamentsExperience
        tournaments={[tournament]}
        viewer={viewer}
        matchResultSubmissions={[]}
        matchResultReportGroups={[]}
        registrationDocuments={registrationDocuments}
        eloVerificationEnabled
      />
    </LocaleProvider>
  );
}

// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TournamentCard } from "@/lib/tournaments";
import { createDisabledTournamentDivisionStates } from "@/tests/fixtures/tournament-division-states";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn(),
    isSignedIn: false,
    userId: null,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/tournaments",
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("tab=participants"),
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

const publicPlayerId = "33333333-3333-4333-8333-333333333333";

const tournament: TournamentCard = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "participant-link-test",
  title: "Participant Link Test",
  format: "1v1",
  ruleFormat: "format_a",
  ruleFormatLabel: "Format A",
  status: "Open",
  statusValue: "registration_open",
  image: "/images/tournaments/1v1-operation-skyfall.jpeg",
  description: "Participant profile-link fixture.",
  organizer: "IronClad Tournaments",
  game: "Company of Heroes 3",
  region: "Global",
  prizePool: "",
  players: 3,
  maxPlayers: 8,
  brackets: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Academy Bracket",
      requirement: "Below 1100 ELO",
      maxPlayers: "Max 8 players",
      registeredPlayers: 3,
      activeCohortPlayers: 3,
      activeCohortSize: 8,
      waitlistedPlayers: 0,
      isFull: false,
      isWaitlistOnly: false,
      launchedAt: null,
      prize: "No prize",
    },
  ],
  divisionStates: createDisabledTournamentDivisionStates(
    "participant-link-test",
    "registration_open"
  ),
  details: "Participant profile-link fixture.",
  rules: "Format A rules.",
  schedule: ["Registration open"],
  contact: "IronClad Admin",
  registrationEnabled: true,
  registrationOpenAt: "2026-08-01T00:00:00.000Z",
  registrationCloseAt: "2026-08-31T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  resultConfirmationWindowMinutes: 30,
  rulesUrl: null,
  battlefyUrl: null,
  participants: [
    {
      registrationId: "44444444-4444-4444-8444-444444444444",
      name: "Public Player",
      profileHref: `/players/${publicPlayerId}`,
      country: "AU",
      elo: 1450,
      status: "approved",
      bracketId: "22222222-2222-4222-8222-222222222222",
      bracketName: "Academy Bracket",
    },
    {
      registrationId: "55555555-5555-4555-8555-555555555555",
      name: "Private Player",
      profileHref: null,
      country: null,
      elo: null,
      status: "approved",
      bracketId: "22222222-2222-4222-8222-222222222222",
      bracketName: "Academy Bracket",
    },
    {
      registrationId: "66666666-6666-4666-8666-666666666666",
      name: "Former Competitor",
      profileHref: null,
      country: null,
      elo: null,
      status: "approved",
      bracketId: "22222222-2222-4222-8222-222222222222",
      bracketName: "Academy Bracket",
    },
  ],
  bracketParticipants: [],
  generatedBrackets: [],
  mapPools: [],
};

afterEach(cleanup);

describe("public Tournament participant profile links", () => {
  it("links only the public identity region to the canonical Player Profile", () => {
    render(
      <TournamentsExperience
        tournaments={[tournament]}
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

    const publicLinks = screen.getAllByRole("link", { name: "Public Player" });
    expect(publicLinks).toHaveLength(2);
    for (const link of publicLinks) {
      expect(link).toHaveAttribute("href", `/players/${publicPlayerId}`);
      expect(link).toHaveClass("focus-visible:ring-2");
    }

    for (const name of ["Private Player", "Former Competitor"]) {
      const identities = screen.getAllByText(name);
      expect(identities).toHaveLength(2);
      expect(identities.every((identity) => identity.closest("a") === null)).toBe(
        true
      );
    }
  });
});

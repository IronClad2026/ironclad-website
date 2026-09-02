// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TournamentCard } from "@/lib/tournaments";

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
  submitTournamentRegistration: vi.fn(),
}));

vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/supabase-browser", () => ({
  createAuthenticatedBrowserSupabaseClient: vi.fn(() => ({})),
}));

import TournamentsExperience from "@/components/TournamentsExperience";

const tournament: TournamentCard = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "published-map-pool-tournament",
  title: "Published Map Pool Tournament",
  month: "August 2026",
  format: "1v1",
  ruleFormat: "format_a",
  ruleFormatLabel: "Format A",
  status: "Open",
  statusValue: "registration_open",
  image: "/images/tournaments/1v1-operation-skyfall.jpeg",
  description: "Public map-pool presentation fixture.",
  organizer: "IronClad Tournaments",
  game: "Company of Heroes 3",
  region: "Global",
  time: "August 2026",
  prizePool: "",
  players: 0,
  maxPlayers: 8,
  brackets: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Academy Bracket",
      requirement: "Below 1100 ELO",
      maxPlayers: "Max 8 players",
      registeredPlayers: 0,
      activeCohortPlayers: 0,
      activeCohortSize: 8,
      waitlistedPlayers: 0,
      isFull: false,
      isWaitlistOnly: false,
      launchedAt: null,
      prize: "Included in tournament prize pool",
    },
  ],
  details: "Public map-pool presentation fixture.",
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
  mapPools: [
    {
      bracketId: "22222222-2222-4222-8222-222222222222",
      divisionName: "Academy Bracket",
      publishedAt: "2026-08-15T00:00:00.000Z",
      launchedAt: null,
      maps: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          slug: "community-crossing",
          displayName: "Community Crossing",
          sourceType: "community",
          creatorName: "Community Cartographer",
          gameMode: "1v1",
          status: "active",
          thumbnailPath: null,
          sourceReference: "https://example.test/community-crossing",
        },
      ],
    },
  ],
};

describe("public tournament map-pool presentation", () => {
  afterEach(cleanup);

  it("plumbs a published pool into both desktop and mobile overview paths", () => {
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

    const desktopAndMobilePools = screen.getAllByRole("region", {
      name: "Published division map pools",
    });

    expect(desktopAndMobilePools).toHaveLength(2);
    for (const pool of desktopAndMobilePools) {
      expect(within(pool).getByRole("heading", { name: "Academy Bracket" }))
        .toBeInTheDocument();
      expect(within(pool).getByText("Community Crossing"))
        .toBeInTheDocument();
      expect(within(pool).getByText("Community")).toBeInTheDocument();
      expect(within(pool).getByText("Active")).toBeInTheDocument();
      expect(within(pool).getByText("Created by Community Cartographer"))
        .toBeInTheDocument();
    }
  });

  it("omits the public map-pool presentation when no pool is published", () => {
    render(
      <TournamentsExperience
        tournaments={[{ ...tournament, mapPools: [] }]}
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
      screen.queryByRole("region", { name: "Published division map pools" })
    ).not.toBeInTheDocument();
  });
});

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
  useSearchParams: () =>
    new URLSearchParams("tab=overview&panel=rules"),
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
  slug: "rules-summary-tournament",
  title: "Rules Summary Tournament",
  month: "August 2026",
  format: "1v1",
  ruleFormat: "format_a",
  ruleFormatLabel: "Format A",
  status: "Open",
  statusValue: "registration_open",
  image: "/images/tournaments/1v1-operation-skyfall.jpeg",
  description: "Rules summary fixture.",
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
  details: "Rules summary fixture.",
  rules: "Tournament-specific Format A rules remain in effect.",
  schedule: [],
  contact: "IronClad Admin",
  registrationEnabled: true,
  registrationOpenAt: "2026-08-01T00:00:00.000Z",
  registrationCloseAt: "2026-08-31T00:00:00.000Z",
  grandFinalAt: "2026-08-31T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  resultConfirmationWindowMinutes: 30,
  rulesUrl: "https://example.test/tournament-rules",
  battlefyUrl: null,
  participants: [],
  bracketParticipants: [],
  generatedBrackets: [],
  mapPools: [],
};

describe("Tournament Rules essentials summary", () => {
  afterEach(cleanup);

  it("renders the same authoritative essentials in desktop and mobile Rules panels", () => {
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

    const summaries = screen.getAllByRole("region", {
      name: "Tournament Essentials",
    });

    expect(summaries).toHaveLength(2);
    for (const summary of summaries) {
      const rules = within(summary);

      expect(rules.getByText("Format A")).toBeInTheDocument();
      expect(summary).toHaveTextContent(
        "CoH3 · 1v1 · 8 Players per Division · Independent single-elimination brackets."
      );
      expect(summary).toHaveTextContent(
        "Quarterfinals: BO3 · Semifinals: BO3 · Grand Final: BO5."
      );
      expect(summary).toHaveTextContent(
        "Each individual Match normally has 7 days from activation."
      );
      expect(summary).toHaveTextContent(
        "Later Matches activate when both Players are known."
      );
      expect(summary).toHaveTextContent(
        "The exact deadline shown with the Match controls"
      );
      expect(summary).toHaveTextContent("within 24 hours");
      expect(summary).toHaveTextContent("after 48 hours");
      expect(summary).toHaveTextContent(
        "These timings are not automatic-forfeit timers."
      );
      expect(summary).toHaveTextContent(
        "one unique .rec replay for every Game played"
      );
      expect(summary).toHaveTextContent(
        "Your opponent confirms or disputes by the displayed deadline."
      );
      expect(summary).toHaveTextContent("Never self-award a no-show.");
      expect(summary).toHaveTextContent("double forfeit");
      expect(summary).toHaveTextContent(
        "Players coordinate Map and Side choices manually"
      );
      expect(summary).toHaveTextContent(
        "Tournament-specific Format A rules remain in effect."
      );
      expect(
        rules.getByRole("link", { name: /Open Tournament Rules/ })
      ).toHaveAttribute("href", "https://example.test/tournament-rules");
      expect(
        rules.getByRole("link", { name: "Read Full Official Rulebook" })
      ).toHaveAttribute("href", "/rules");

      const copy = (summary.textContent ?? "").toLowerCase();
      expect(copy).not.toContain("9 days");
      expect(copy).not.toContain("automatic extension");
      expect(copy).not.toContain("automatic win after 48 hours");
      expect(copy).not.toContain("7 days per round");
    }

    expect(summaries[0]?.textContent).toBe(summaries[1]?.textContent);
  });
});

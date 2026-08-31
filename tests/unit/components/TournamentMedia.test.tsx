// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TournamentMedia from "@/components/TournamentMedia";
import { mapTournamentRow, type TournamentCard } from "@/lib/tournaments";

afterEach(cleanup);

function buildTournament(): TournamentCard {
  const tournament = mapTournamentRow({
    id: "11111111-1111-4111-8111-111111111111",
    slug: "media-test",
    title: "IronClad Media Test",
    description: "A public Tournament.",
    banner_image_url: "/images/tournaments/1v1-operation-skyfall.jpeg",
    registration_open_at: null,
    registration_close_at: null,
    start_date: null,
    end_date: null,
    status: "upcoming",
    format: "1v1",
    rule_format: "format_a",
    result_confirmation_window_minutes: 30,
    prize_pool: "",
    rules_url: "https://example.com/rules",
    battlefy_url: "https://example.com/archive",
    registration_enabled: true,
    grand_final_at: null,
    created_at: "2026-08-31T00:00:00.000Z",
    updated_at: "2026-08-31T00:00:00.000Z",
    tournament_brackets: [],
  });

  tournament.media = [
    {
      id: "21111111-1111-4111-8111-111111111111",
      title: "Grand Final Cast",
      url: "https://www.youtube.com/watch?v=ironclad",
      mediaType: "match_cast",
      description: "Player Alpha vs Player Bravo",
    },
    {
      id: "31111111-1111-4111-8111-111111111111",
      title: "Full Tournament Cast",
      url: "https://www.twitch.tv/videos/123456",
      mediaType: "full_tournament",
      description: null,
    },
    {
      id: "41111111-1111-4111-8111-111111111111",
      title: "Highlights",
      url: "https://example.com/highlights",
      mediaType: "video",
      description: null,
    },
    {
      id: "51111111-1111-4111-8111-111111111111",
      title: "Community Analysis",
      url: "https://example.com/analysis",
      mediaType: "other",
      description: null,
    },
  ];

  return tournament;
}

describe("TournamentMedia", () => {
  it.each(["desktop", "mobile"] as const)(
    "renders public external media cards in the %s presentation",
    (presentation) => {
      const { container } = render(
        <TournamentMedia
          presentation={presentation}
          tournament={buildTournament()}
        />
      );

      const root = container.querySelector(
        `[data-tournament-media-presentation="${presentation}"]`
      );
      expect(root).not.toBeNull();
      expect(
        screen.getByRole("heading", {
          name: "IronClad Media Test — Tournament Media",
        })
      ).toBeInTheDocument();
      expect(screen.getByText("Match Cast")).toBeInTheDocument();
      expect(screen.getByText("Full Tournament")).toBeInTheDocument();
      expect(screen.getByText("Video")).toBeInTheDocument();
      expect(screen.getByText("Other")).toBeInTheDocument();
      expect(screen.getByText("Player Alpha vs Player Bravo")).toBeInTheDocument();

      const grandFinal = screen.getByRole("link", {
        name: "Watch: Grand Final Cast. Opens in a new tab",
      });
      expect(grandFinal).toHaveAttribute(
        "href",
        "https://www.youtube.com/watch?v=ironclad"
      );
      expect(grandFinal).toHaveAttribute("target", "_blank");
      expect(grandFinal).toHaveAttribute("rel", "noopener noreferrer");
      expect(grandFinal.className).toContain("min-h-44");
      expect(grandFinal.className).toContain("min-w-0");
    }
  );

  it("keeps long smartphone content in a single overflow-safe column", () => {
    const tournament = buildTournament();
    const firstItem = tournament.media?.[0];
    expect(firstItem).toBeDefined();
    tournament.media = [
      {
        ...firstItem!,
        title: "AVeryLongUnbrokenTournamentMediaTitleThatMustRemainInsideThePhoneViewport",
        description:
          "A long authored description that must wrap safely without exposing or rendering the underlying external URL.",
      },
    ];

    const { container } = render(
      <TournamentMedia presentation="mobile" tournament={tournament} />
    );
    const root = container.querySelector(
      '[data-tournament-media-presentation="mobile"]'
    );
    const list = root?.querySelector("ul");
    const title = screen.getByText(tournament.media[0].title);

    expect(root).toHaveClass("w-full", "max-w-full", "min-w-0");
    expect(list).toHaveClass("grid-cols-1", "w-full", "max-w-full", "min-w-0");
    expect(title).toHaveClass("break-words", "min-w-0");
    expect(screen.queryByText(tournament.media[0].url)).not.toBeInTheDocument();
  });

  it("renders a clean empty state when no published media is projected", () => {
    const tournament = buildTournament();
    tournament.media = [];

    render(<TournamentMedia presentation="mobile" tournament={tournament} />);

    expect(
      screen.getByText("No Tournament media has been published.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

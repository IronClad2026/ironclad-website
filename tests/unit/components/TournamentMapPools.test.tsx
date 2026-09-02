// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TournamentMapPools from "@/components/TournamentMapPools";
import type { PublishedTournamentMapPool } from "@/lib/tournament-map-pools";

const publishedPool: PublishedTournamentMapPool = {
  bracketId: "bracket-academy",
  divisionName: "Academy Bracket",
  publishedAt: "2026-08-15T00:00:00.000Z",
  launchedAt: null,
  maps: [
    {
      id: "map-road-to-tunis",
      slug: "road-to-tunis",
      displayName: "Road to Tunis",
      sourceType: "official",
      creatorName: null,
      gameMode: "1v1",
      status: "active",
      thumbnailPath: null,
      sourceReference: null,
    },
    {
      id: "map-community-crossing",
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
};

describe("TournamentMapPools", () => {
  afterEach(cleanup);

  it("renders a responsive published pool with public catalogue details", () => {
    render(<TournamentMapPools pools={[publishedPool]} />);

    expect(
      screen.getByRole("region", { name: "Published division map pools" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Academy Bracket" }))
      .toBeInTheDocument();
    expect(screen.getByText("Road to Tunis")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();
    expect(screen.getByText("Community Crossing")).toBeInTheDocument();
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(screen.getByText("Created by Community Cartographer"))
      .toBeInTheDocument();
    expect(screen.getByText("2 maps")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getAllByText("Active")).toHaveLength(2);
    expect(
      screen.getByRole("img", {
        name: "Road to Tunis thumbnail unavailable",
      })
    ).toBeInTheDocument();
  });

  it("shows launched pools as frozen and renders a safe empty state", () => {
    const { rerender } = render(
      <TournamentMapPools
        pools={[
          {
            ...publishedPool,
            launchedAt: "2026-08-16T00:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByText("Frozen")).toBeInTheDocument();

    rerender(<TournamentMapPools pools={[]} />);
    expect(
      screen.getByText("No Division map pools have been published yet.")
    ).toBeInTheDocument();
  });

  it("renders two divisions as independent stacked sections", () => {
    render(
      <TournamentMapPools
        pools={[
          publishedPool,
          {
            ...publishedPool,
            bracketId: "bracket-challenge",
            divisionName: "Challenge Bracket",
          },
        ]}
      />
    );

    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(within(articles[0]).getByRole("heading", { name: "Academy Bracket" }))
      .toBeInTheDocument();
    expect(
      within(articles[1]).getByRole("heading", { name: "Challenge Bracket" })
    ).toBeInTheDocument();
  });

  it("stacks divisions and keeps map columns monotonic across breakpoints", () => {
    const pools: PublishedTournamentMapPool[] = [
      publishedPool,
      {
        ...publishedPool,
        bracketId: "bracket-challenge",
        divisionName: "Challenge Bracket With A Long Translated Name",
        maps: [
          {
            ...publishedPool.maps[0],
            id: "map-retired",
            displayName: "A Very Long Retired Community Battlefield Name",
            sourceType: "community",
            creatorName:
              "An Intentionally Long Community Cartographer Attribution",
            status: "retired",
            thumbnailPath: "/images/tournaments/1v1-operation-skyfall.jpeg",
          },
          {
            ...publishedPool.maps[0],
            id: "map-two",
            displayName: "Map Two",
          },
          {
            ...publishedPool.maps[0],
            id: "map-three",
            displayName: "Map Three",
          },
          {
            ...publishedPool.maps[0],
            id: "map-four",
            displayName: "Map Four",
          },
          {
            ...publishedPool.maps[0],
            id: "map-five",
            displayName: "Map Five",
          },
        ],
      },
      {
        ...publishedPool,
        bracketId: "bracket-main",
        divisionName: "Main / Pro Bracket",
        launchedAt: "2026-08-16T00:00:00.000Z",
        maps: [
          {
            ...publishedPool.maps[0],
            id: "map-disabled",
            status: "temporarily_disabled",
          },
        ],
      },
    ];

    render(<TournamentMapPools pools={pools} />);

    const region = screen.getByRole("region", {
      name: "Published division map pools",
    });
    const articles = screen.getAllByRole("article");

    expect(articles).toHaveLength(3);
    expect(region).not.toHaveClass("overflow-hidden");
    expect(region.querySelector(":scope > div.mt-6")).not.toHaveClass(
      "lg:grid-cols-3"
    );

    for (const article of articles) {
      const mapList = article.querySelector("ul");
      expect(mapList).toHaveClass("sm:grid-cols-2", "2xl:grid-cols-3");
      expect(mapList).not.toHaveClass("lg:grid-cols-1", "2xl:grid-cols-2");
    }

    expect(within(articles[1]).getAllByRole("listitem")).toHaveLength(5);
    expect(within(articles[1]).getByText("5 maps")).toBeInTheDocument();

    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(screen.getByText("Temporarily disabled")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Created by An Intentionally Long Community Cartographer Attribution"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "A Very Long Retired Community Battlefield Name map thumbnail",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Challenge Bracket With A Long Translated Name",
      })
    ).toBeInTheDocument();
  });
});

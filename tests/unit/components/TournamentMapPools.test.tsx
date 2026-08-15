// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TournamentMapPools from "@/components/TournamentMapPools";
import type { PublishedTournamentMapPool } from "@/lib/tournament-map-pools";

const publishedPool: PublishedTournamentMapPool = {
  bracketId: "bracket-academy",
  divisionName: "Academy",
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
    expect(screen.getByRole("heading", { name: "Academy" }))
      .toBeInTheDocument();
    expect(screen.getByText("Road to Tunis")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();
    expect(screen.getByText("Community Crossing")).toBeInTheDocument();
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(screen.getByText("Created by Community Cartographer"))
      .toBeInTheDocument();
    expect(screen.getByText("2 maps")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
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
});

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicPlayerByIdMock = vi.hoisted(() => vi.fn());
const getPublicActiveTournamentEloSnapshotsMock = vi.hoisted(() => vi.fn());
const publicPlayerStatsMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/components/PublicPlayerProfileHeader", () => ({
  default: vi.fn(),
}));

vi.mock("@/components/PublicPlayerStats", () => ({
  default: publicPlayerStatsMock,
}));

vi.mock("@/lib/public-players", () => ({
  getPublicPlayerById: getPublicPlayerByIdMock,
}));

vi.mock("@/lib/active-tournament-elo-snapshots", () => ({
  getPublicActiveTournamentEloSnapshots:
    getPublicActiveTournamentEloSnapshotsMock,
}));

import PublicPlayerProfilePage from "@/app/players/[playerId]/page";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const player = {
  id: PLAYER_ID,
  displayName: "Public Tester",
  playerName: "PublicTester",
  country: "Australia",
  region: "Oceania",
  currentElo: 1550,
  publicProfileEnabled: true,
  discordPublicEnabled: false,
  discordUsername: null,
  hasAvatar: false,
  avatarUrl: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};
const activeTournamentEloSnapshots = [
  {
    tournamentTitle: "IronClad August Open",
    elo: 1325,
    division: "Challenge",
  },
];

describe("public profile active tournament ELO snapshots", () => {
  beforeEach(() => {
    getPublicPlayerByIdMock.mockReset();
    getPublicActiveTournamentEloSnapshotsMock.mockReset();
    notFoundMock.mockReset();
  });

  it("passes only the safe frozen snapshots to the public Current ELO card", async () => {
    getPublicPlayerByIdMock.mockResolvedValue(player);
    getPublicActiveTournamentEloSnapshotsMock.mockResolvedValue(
      activeTournamentEloSnapshots
    );

    const page = await PublicPlayerProfilePage({
      params: Promise.resolve({ playerId: PLAYER_ID }),
    });
    const stats = findElementByType(page, publicPlayerStatsMock);

    expect(getPublicPlayerByIdMock).toHaveBeenCalledWith(PLAYER_ID);
    expect(getPublicActiveTournamentEloSnapshotsMock).toHaveBeenCalledWith(
      PLAYER_ID
    );
    expect(stats?.props).toEqual({
      player,
      activeTournamentEloSnapshots,
    });
    expect(stats?.props.player).toMatchObject({ currentElo: 1550 });
    expect(stats?.props.activeTournamentEloSnapshots).toEqual([
      {
        tournamentTitle: "IronClad August Open",
        elo: 1325,
        division: "Challenge",
      },
    ]);
    expect(JSON.stringify(stats?.props.activeTournamentEloSnapshots)).not.toContain(
      PLAYER_ID
    );
    expect(JSON.stringify(stats?.props.activeTournamentEloSnapshots)).not.toContain(
      "user_private"
    );
    expect(JSON.stringify(stats?.props.activeTournamentEloSnapshots)).not.toContain(
      "76561198012345678"
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

function findElementByType(
  node: ReactNode,
  type: unknown
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, type);

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === type) {
    return node as ReactElement<Record<string, unknown>>;
  }

  return findElementByType(
    (node.props as { children?: ReactNode }).children,
    type
  );
}

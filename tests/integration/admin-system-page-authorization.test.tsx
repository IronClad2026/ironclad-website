import { isValidElement, type ElementType, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const completedTournamentsMock = vi.hoisted(() => vi.fn());
const recentRunsMock = vi.hoisted(() => vi.fn());
const eloSettingMock = vi.hoisted(() => vi.fn());
const eloSupportLinkSettingMock = vi.hoisted(() => vi.fn());
const leaderboardControlsMock = vi.hoisted(() => vi.fn(() => null));
const eloCheckerMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/leaderboard/admin", () => ({
  getCompletedLeaderboardTournaments: completedTournamentsMock,
  getRecentLeaderboardRecalculationRuns: recentRunsMock,
}));
vi.mock("@/lib/platform-settings", () => ({
  getEloVerificationSetting: eloSettingMock,
  getEloVerificationSupportLinkSetting: eloSupportLinkSettingMock,
}));
vi.mock("@/components/AdminLeaderboardControls", () => ({
  default: leaderboardControlsMock,
}));
vi.mock("@/components/AdminEloVerificationChecker", () => ({
  default: eloCheckerMock,
}));

import AdminSystemPage from "@/app/admin/system/page";

describe("Admin System & Recovery page authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
    completedTournamentsMock.mockReset();
    recentRunsMock.mockReset();
    eloSettingMock.mockReset();
    eloSupportLinkSettingMock.mockReset();
  });

  it.each([
    ["signed-out", anonymousIdentity],
    ["non-Admin", playerIdentity],
  ])("redirects a %s identity before loading recovery data", async (_, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(AdminSystemPage()).rejects.toThrow("NEXT_REDIRECT:/");

    expect(completedTournamentsMock).not.toHaveBeenCalled();
    expect(recentRunsMock).not.toHaveBeenCalled();
    expect(eloSettingMock).not.toHaveBeenCalled();
    expect(eloSupportLinkSettingMock).not.toHaveBeenCalled();
  });

  it("reuses the existing recovery and legacy presentations for an Admin", async () => {
    const completedTournaments = [
      { id: "tournament-1", title: "Completed Cup", date: null },
    ];
    const recentRuns = [
      {
        id: "run-1",
        scope: "all_time",
        status: "completed",
        startedAt: "2026-08-27T00:00:00.000Z",
        finishedAt: "2026-08-27T00:00:01.000Z",
        notes: null,
        tournamentId: null,
        tournamentTitle: null,
        seasonId: null,
        seasonName: null,
      },
    ];
    const setting = {
      enabled: false,
      updatedAt: null,
      updatedByClerkUserId: null,
      error: null,
    };
    const supportLinkSetting = {
      url: "https://support.example.test/elo",
      updatedAt: null,
      updatedByClerkUserId: null,
      error: null,
    };
    authMock.mockResolvedValue(adminIdentity);
    completedTournamentsMock.mockResolvedValue(completedTournaments);
    recentRunsMock.mockResolvedValue(recentRuns);
    eloSettingMock.mockResolvedValue(setting);
    eloSupportLinkSettingMock.mockResolvedValue(supportLinkSetting);

    const page = await AdminSystemPage();
    const leaderboardControls = findElementByType(
      page,
      leaderboardControlsMock
    );
    const eloChecker = findElementByType(page, eloCheckerMock);

    expect(completedTournamentsMock).toHaveBeenCalledExactlyOnceWith();
    expect(recentRunsMock).toHaveBeenCalledExactlyOnceWith(8);
    expect(eloSettingMock).toHaveBeenCalledExactlyOnceWith();
    expect(eloSupportLinkSettingMock).toHaveBeenCalledExactlyOnceWith();
    expect(leaderboardControls?.props).toMatchObject({
      completedTournaments,
      recentRuns,
    });
    expect(eloChecker?.props).toMatchObject({
      setting,
      supportLinkSetting,
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

function findElementByType(
  node: ReactNode,
  type: ElementType
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, type);
      if (match) return match;
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

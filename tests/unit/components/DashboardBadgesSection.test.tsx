// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardBadgesSection from "@/components/badges/DashboardBadgesSection";
import { buildDashboardBadgeData } from "@/lib/badges/dashboard";
import { mockNewUnlockQueued } from "@/lib/badges/fixtures";
import type { PlayerBadgeAward } from "@/lib/badges/types";

type MockImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  unoptimized?: boolean;
};

vi.mock("next/image", async () => {
  const react = await vi.importActual<typeof import("react")>("react");

  return {
    default: (props: MockImageProps) => {
      const imageProps = { ...props };
      delete imageProps.unoptimized;

      return react.createElement("img", imageProps);
    },
  };
});

describe("DashboardBadgesSection", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders a compact badge showcase instead of the full collection grid", () => {
    render(<DashboardBadgesSection badgeData={buildDashboardBadgeData()} />);

    expect(
      screen.getByRole("heading", { name: "IronClad badge collection" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("0/30 earned")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Featured dashboard badges" })
    ).toHaveAttribute("data-dashboard-badge-showcase-count", "6");
    expect(getShowcaseButtons()).toHaveLength(6);
    expect(screen.queryByRole("list", {
      name: "IronClad badge collection slots",
    })).not.toBeInTheDocument();
  });

  it("respects the maximum showcase count and prefers recent earned badges", () => {
    render(
      <DashboardBadgesSection
        badgeData={buildDashboardBadgeData({
          awards: makeAwards([1, 2, 3, 4, 5, 6, 7]),
        })}
      />
    );

    const showcased = getShowcaseButtons();

    expect(showcased).toHaveLength(6);
    expect(showcased.every((button) => button.dataset.badgeState === "earned"))
      .toBe(true);
    expect(showcased.map((button) => button.dataset.badgeSlug)).toEqual([
      "iron-regular",
      "first-campaign",
      "rising-through-the-ranks",
      "battle-tested",
      "first-victory",
      "first-deployment",
    ]);
  });

  it("does not invent earned badges in the zero-award teaser state", () => {
    render(<DashboardBadgesSection badgeData={buildDashboardBadgeData()} />);

    expect(getShowcaseButtons()).toHaveLength(6);
    expect(
      getShowcaseButtons().every(
        (button) => button.dataset.badgeState === "locked"
      )
    ).toBe(true);
    expect(screen.getByText(/earn badges by competing/i))
      .toBeInTheDocument();
  });

  it("links to the dedicated dashboard badge collection page", () => {
    render(<DashboardBadgesSection badgeData={buildDashboardBadgeData()} />);

    expect(
      screen.getByRole("link", { name: /view badge collection/i })
    ).toHaveAttribute("href", "/dashboard/badges");
  });

  it("opens badge details from showcase card and artwork clicks", async () => {
    render(<DashboardBadgesSection badgeData={buildDashboardBadgeData()} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "IronClad Recruit, Common, locked",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("IronClad Recruit");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Complete identity and ELO verification"
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Locked");

    fireEvent.click(screen.getByRole("button", { name: "Close badge details" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("img", {
        name: "First Deployment badge artwork",
      })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("First Deployment");
  });

  it("opens earned showcase badge details with keyboard interaction", () => {
    render(
      <DashboardBadgesSection
        badgeData={buildDashboardBadgeData({
          awards: makeAwards([1]),
        })}
      />
    );

    const earnedBadge = screen.getByRole("button", {
      name: "IronClad Recruit, Common, earned",
    });

    fireEvent.keyDown(earnedBadge, { key: "Enter" });
    expect(screen.getByRole("dialog")).toHaveTextContent("Earned");
    expect(screen.getByRole("dialog")).toHaveTextContent("Original awarded");
    fireEvent.keyDown(window, { key: "Escape" });
  });

  it("marks an owned unrevealed showcase badge as new", () => {
    render(
      <DashboardBadgesSection
        badgeData={buildDashboardBadgeData({
          awards: [
            {
              badgeSlug: "ironclad-recruit",
              awardId: "award-new-recruit",
              awardedAt: "2026-08-01T12:00:00.000Z",
              isUnrevealed: true,
            },
          ],
        })}
      />
    );

    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("clears the new marker immediately after acknowledgement", async () => {
    const acknowledgeRevealAction = vi.fn(async () => ({
      status: "success" as const,
      code: "acknowledged" as const,
    }));

    render(
      <DashboardBadgesSection
        badgeData={buildDashboardBadgeData({
          awards: [
            {
              badgeSlug: "first-victory",
              awardId: mockNewUnlockQueued.id,
              awardedAt: mockNewUnlockQueued.queuedAt,
              isUnrevealed: true,
            },
          ],
        })}
        pendingReveals={[mockNewUnlockQueued]}
        acknowledgeRevealAction={acknowledgeRevealAction}
      />
    );

    expect(screen.getByText("New")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(acknowledgeRevealAction).toHaveBeenCalledWith(
        mockNewUnlockQueued.id
      );
      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });
  });

  it("keeps development laboratory controls off the dashboard", () => {
    render(<DashboardBadgesSection badgeData={buildDashboardBadgeData()} />);

    expect(screen.queryByRole("tab", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Mock" })).not.toBeInTheDocument();
    expect(screen.queryByText("Badge Preview / Mock Data")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Free" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Premium" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Free reveal" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Premium reveal" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Queue" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retroactive" }))
      .not.toBeInTheDocument();
  });

  it("uses bounded responsive showcase grid classes", () => {
    render(<DashboardBadgesSection badgeData={buildDashboardBadgeData()} />);

    const list = screen.getByRole("list", {
      name: "Featured dashboard badges",
    });

    expect(list).toHaveClass("grid-cols-2");
    expect(list).toHaveClass("sm:grid-cols-3");
    expect(list).toHaveClass("xl:grid-cols-6");
    expect(list.className).not.toContain("grid-cols-10");
    expect(
      within(list).getAllByRole("button").every(
        (button) => button.className.includes("min-h-[17rem]")
      )
    ).toBe(true);
  });
});

function getShowcaseButtons() {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "button[data-dashboard-badge-showcase-item]"
    )
  );
}

function makeAwards(numbers: number[]): PlayerBadgeAward[] {
  const slugsByNumber = new Map<number, PlayerBadgeAward["badgeSlug"]>([
    [1, "ironclad-recruit"],
    [2, "first-deployment"],
    [3, "first-victory"],
    [4, "battle-tested"],
    [5, "rising-through-the-ranks"],
    [6, "first-campaign"],
    [7, "iron-regular"],
  ]);

  return numbers.map((number) => ({
    badgeSlug: slugsByNumber.get(number) ?? "ironclad-recruit",
    awardedAt: `2026-08-${String(number).padStart(2, "0")}T12:00:00.000Z`,
    originalAwardedAt: `2026-08-${String(number).padStart(2, "0")}T12:00:00.000Z`,
  }));
}
